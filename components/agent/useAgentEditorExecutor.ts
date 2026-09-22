"use client";

/**
 * useAgentEditorExecutor — 시험 편집기 페이지용 AI 에이전트 액션 실행기.
 *
 * AgentRunController 가 emit 하는 편집기 UI 액션(navigate 제외)을 실제 편집기
 * React 핸들러로 매핑하고, useAgentPresence / typeText 체화 애니메이션을 입힌다.
 * 또한 현재 편집기 상태를 AgentPageState 로 보고하는 getPageState 를 제공한다.
 *
 * 핸들러가 편집기 페이지(app/(app)/instructor/new/page.tsx)에 있으므로
 * 이 훅도 그 페이지에서 호출하며, 필요한 state/setter 를 인자로 받는다.
 *
 * 반환된 executor 는 컨트롤러의 registerExecutor 로 등록한다.
 * 일반(비에이전트) 사용에는 어떤 영향도 주지 않는다 — 호출되지 않으면 무동작.
 */

import { useCallback, useMemo, useRef, type RefObject } from "react";
import { useAgentPresence } from "@/components/agent/AgentPresenceProvider";
import { typeText } from "@/components/agent/typeText";
import type { CaseQuestionGeneratorHandle } from "@/components/instructor/CaseQuestionGenerator";
import type { AgentEditorExecutor } from "@/components/agent/AgentRunController";
import type { Question } from "@/components/instructor/QuestionEditor";
import type { AgentPageState, AgentUiAction } from "@/lib/agent/ui-actions";

/** HTML 본문에서 텍스트만 추출해 짧은 요약으로. */
function summarizeHtml(html: string, max = 80): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 다음 프레임까지 대기 — controlled state 반영 후 DOM 측정용. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 편집기 페이지가 이 훅에 넘기는 의존성. */
export interface AgentEditorExecutorDeps {
  /** 현재 시험 제목. */
  examTitle: string;
  /** 시험 제목 setter (controlled). */
  setExamTitle: (value: string) => void;
  /** 제목 입력 DOM 요소 ref — 체화 애니메이션 타깃. */
  titleElementRef: RefObject<HTMLElement | null>;
  /** 현재 문제 목록. */
  questions: Question[];
  /** 빈 문제 1개 추가. */
  addQuestion: () => void;
  /** id 로 문제 제거. */
  removeQuestionById: (id: string) => void;
  /** 문제 필드 수정. */
  updateQuestion: (
    id: string,
    field: keyof Question,
    value: string | boolean,
  ) => void;
  /** CaseQuestionGenerator 명령형 핸들 ref. */
  generatorRef: RefObject<CaseQuestionGeneratorHandle | null>;
  /** 현재 라우트(보통 "/instructor/new"). */
  route: string;
}

export function useAgentEditorExecutor(
  deps: AgentEditorExecutorDeps,
): AgentEditorExecutor {
  const presence = useAgentPresence();

  const {
    examTitle,
    setExamTitle,
    titleElementRef,
    questions,
    addQuestion,
    removeQuestionById,
    updateQuestion,
    generatorRef,
    route,
  } = deps;

  /**
   * 방금 쓴 값을 React 가 확인할 때까지 들고 있는다 (이슈 #441).
   *
   * 컨트롤러는 액션 배치가 끝나자마자 `getPageState()` 를 읽어 서버로 보낸다.
   * 그런데 `setExamTitle` 은 업데이트를 **예약**만 하므로, 그 시점의 클로저는
   * 아직 이전 값을 들고 있다 — 마지막 글자가 빠진 제목이 보고되고, 모델은
   * 자기가 쓴 값과 다르니 실패로 판단해 재시도한다. 실제로는 성공한 작업인데
   * "글자 수 제한" 같은 없는 원인을 지목했다.
   *
   * 타이밍(rAF 두 번 대기 등)에 기대지 않고, executor 가 **자기가 쓴 값**을
   * 기억하게 한다.
   *
   * 비우는 조건은 "예약값과 props 가 같아지면" 이 아니라 **"props 가 조금이라도
   * 움직이면"** 이다. 전자로 하면 에이전트가 X 를 쓴 뒤 사용자가 직접 Y 로
   * 고쳤을 때 예약값이 영영 X 로 남아, 원래 버그보다 오래 거짓말한다.
   * props 가 움직였다는 건 React 가 이미 커밋했다는 뜻이고, 그때부터는
   * props 가 예약값보다 항상 최신이다.
   */
  const pendingTitleRef = useRef<string | null>(null);
  const lastSeenTitleRef = useRef(examTitle);
  if (lastSeenTitleRef.current !== examTitle) {
    lastSeenTitleRef.current = examTitle;
    pendingTitleRef.current = null;
  }

  // ── 현재 편집기 상태 → AgentPageState ──────────────────────────
  const getPageState = useCallback((): AgentPageState => {
    return {
      route:
        typeof window !== "undefined" ? window.location.pathname : route,
      examTitle: pendingTitleRef.current ?? examTitle,
      questionCount: questions.length,
      questions: questions.map((q, index) => ({
        index,
        type: q.type,
        summary: summarizeHtml(q.text),
      })),
      isGenerating: generatorRef.current?.getIsGenerating() ?? false,
    };
  }, [examTitle, questions, generatorRef, route]);

  // ── set_exam_title — 제목 필드 focus + 타이핑 ──────────────────
  const runSetExamTitle = useCallback(
    async (text: string): Promise<{ ok: boolean; error?: string }> => {
      const el = titleElementRef.current;
      await presence.focusOn(el, { label: "제목 입력 중…" });
      presence.setActive(true);
      try {
        await typeText({ target: text, onChange: setExamTitle });
        // React 가 이 값을 반영하기 전에 컨트롤러가 pageState 를 읽는다 (#441).
        pendingTitleRef.current = text;
        return { ok: true };
      } catch (err) {
        // typeText 가 AbortError 면 무시하되 값은 최종값으로 확정.
        setExamTitle(text);
        pendingTitleRef.current = text;
        if (err instanceof Error && err.name === "AbortError") {
          return { ok: true };
        }
        return { ok: false, error: "제목 입력 중 오류가 발생했습니다." };
      } finally {
        presence.setActive(false);
        presence.clear();
      }
    },
    [presence, setExamTitle, titleElementRef],
  );

  // ── set_topic — 생성기 freeform 필드 focus + 타이핑 ────────────
  const runSetTopic = useCallback(
    async (text: string): Promise<{ ok: boolean; error?: string }> => {
      const handle = generatorRef.current;
      if (!handle) {
        return { ok: false, error: "문제 생성기가 준비되지 않았습니다." };
      }
      const el = handle.getFreeformElement();
      await presence.focusOn(el, { label: "주제 입력 중…" });
      presence.setActive(true);
      try {
        await typeText({
          target: text,
          onChange: (v) => handle.setFreeformPrompt(v),
        });
        return { ok: true };
      } catch (err) {
        handle.setFreeformPrompt(text);
        if (err instanceof Error && err.name === "AbortError") {
          return { ok: true };
        }
        return { ok: false, error: "주제 입력 중 오류가 발생했습니다." };
      } finally {
        presence.setActive(false);
        presence.clear();
      }
    },
    [presence, generatorRef],
  );

  // ── set_question_count — 생성기 문항 수 설정 + 하이라이트 ──────
  const runSetQuestionCount = useCallback(
    async (count: number): Promise<{ ok: boolean; error?: string }> => {
      const handle = generatorRef.current;
      if (!handle) {
        return { ok: false, error: "문제 생성기가 준비되지 않았습니다." };
      }
      const el = handle.getCountElement();
      await presence.focusOn(el, { label: "문항 수 설정 중…" });
      presence.setActive(true);
      handle.setQuestionCount(count);
      await delay(320);
      presence.setActive(false);
      presence.clear();
      return { ok: true };
    },
    [presence, generatorRef],
  );

  // ── set_difficulty — 생성기에 난이도 컨트롤이 없으므로 하이라이트만 ──
  // CaseQuestionGenerator 는 현재 difficulty 가 "basic" 고정이다.
  // 액션 자체는 실패시키지 않고(루프가 막히지 않도록) 안내만 한다.
  const runSetDifficulty = useCallback(
    async (
      difficulty: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const handle = generatorRef.current;
      const el = handle?.getGenerateButtonElement() ?? null;
      await presence.focusOn(el, { label: `난이도: ${difficulty}` });
      await delay(280);
      presence.clear();
      // 편집기에 난이도 컨트롤이 없음을 에이전트에 알려 다음 판단에 활용.
      return {
        ok: true,
        error:
          "편집기에 난이도 컨트롤이 없어 기본(basic) 난이도로 진행됩니다.",
      };
    },
    [presence, generatorRef],
  );

  // ── generate_questions — 생성 트리거 + 완료까지 대기 ───────────
  const runGenerateQuestions = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    const handle = generatorRef.current;
    if (!handle) {
      return { ok: false, error: "문제 생성기가 준비되지 않았습니다." };
    }
    if (handle.getIsGenerating()) {
      return { ok: false, error: "이미 문제 생성이 진행 중입니다." };
    }
    const el = handle.getGenerateButtonElement();
    await presence.focusOn(el, { label: "문제 생성 중…" });
    presence.setActive(true);
    try {
      // handle.triggerGenerate 는 스트리밍이 끝날 때 resolve 된다.
      await handle.triggerGenerate();
      // 생성 완료 후 문제 목록 반영(onQuestionsAccepted)이 다음 렌더에 발생.
      await nextFrame();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "문제 생성 중 오류가 발생했습니다.",
      };
    } finally {
      presence.setActive(false);
      presence.clear();
    }
  }, [presence, generatorRef]);

  // ── add_question — 빈 문제 1개 추가 ────────────────────────────
  const runAddQuestion = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    presence.setStatusLabel("문제 추가 중…");
    addQuestion();
    await delay(260);
    presence.clear();
    return { ok: true };
  }, [presence, addQuestion]);

  // ── remove_question — index 로 문제 제거 ───────────────────────
  const runRemoveQuestion = useCallback(
    async (index: number): Promise<{ ok: boolean; error?: string }> => {
      const target = questions[index];
      if (!target) {
        return {
          ok: false,
          error: `${index + 1}번 문제가 존재하지 않습니다.`,
        };
      }
      presence.setStatusLabel(`${index + 1}번 문제 삭제 중…`);
      removeQuestionById(target.id);
      await delay(260);
      presence.clear();
      return { ok: true };
    },
    [presence, questions, removeQuestionById],
  );

  // ── revise_question — index 의 문제를 AI 로 수정 ───────────────
  // instruction 은 "어떻게 고칠지"에 대한 지시다. 기존 /api/ai/adjust-question
  // 엔드포인트로 현재 문제 본문 + 지시를 보내 실제 수정된 본문을 받아 반영한다.
  const runReviseQuestion = useCallback(
    async (
      index: number,
      instruction: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const target = questions[index];
      if (!target) {
        return {
          ok: false,
          error: `${index + 1}번 문제가 존재하지 않습니다.`,
        };
      }
      presence.setStatusLabel(`${index + 1}번 문제 수정 중…`);
      presence.setActive(true);
      try {
        const res = await fetch("/api/ai/adjust-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: target.text,
            instruction,
            examTitle: examTitle || undefined,
            language: "ko",
            generationMode: "case",
          }),
        });
        const body: {
          questionText?: string;
          message?: string;
          error?: string;
        } | null = await res.json().catch(() => null);
        if (!res.ok || !body?.questionText) {
          return {
            ok: false,
            error:
              body?.message || body?.error || "문제 수정에 실패했습니다.",
          };
        }
        updateQuestion(target.id, "text", body.questionText);
        await delay(320);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "문제 수정 중 오류가 발생했습니다.",
        };
      } finally {
        presence.setActive(false);
        presence.clear();
      }
    },
    [presence, questions, updateQuestion, examTitle],
  );

  // ── 액션 디스패치 ──────────────────────────────────────────────
  const executeAction = useCallback(
    async (
      action: AgentUiAction,
    ): Promise<{ ok: boolean; error?: string }> => {
      switch (action.type) {
        case "set_exam_title":
          return runSetExamTitle(action.text);
        case "set_topic":
          return runSetTopic(action.text);
        case "set_question_count":
          return runSetQuestionCount(action.count);
        case "set_difficulty":
          return runSetDifficulty(action.difficulty);
        case "generate_questions":
          return runGenerateQuestions();
        case "add_question":
          return runAddQuestion();
        case "remove_question":
          return runRemoveQuestion(action.index);
        case "revise_question":
          return runReviseQuestion(action.index, action.instruction);
        case "navigate":
          // navigate 는 컨트롤러가 직접 처리한다 — 여기 도달하면 안 됨.
          return {
            ok: false,
            error: "navigate 는 편집기 실행기가 처리하지 않습니다.",
          };
        default: {
          // 망라성 체크 — 새 액션 타입 추가 시 컴파일 에러로 알림.
          const _exhaustive: never = action;
          void _exhaustive;
          return { ok: false, error: "알 수 없는 액션입니다." };
        }
      }
    },
    [
      runSetExamTitle,
      runSetTopic,
      runSetQuestionCount,
      runSetDifficulty,
      runGenerateQuestions,
      runAddQuestion,
      runRemoveQuestion,
      runReviseQuestion,
    ],
  );

  return useMemo<AgentEditorExecutor>(
    () => ({ executeAction, getPageState }),
    [executeAction, getPageState],
  );
}
