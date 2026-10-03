// @vitest-environment jsdom
/**
 * 시험 화면 안 복사 표식(보이지 않는 문자)은 판정에만 쓰이고 답안에는 남지 않는다(#555).
 *
 * `CopyProtector`(문제 본문, AI 대화, 평가 기준)가 붙이던 표식은 폭 없는 공백 3개(U+200B×3)라서,
 * 답안 칸 붙여넣기가 지우는 표식(ZWSP + U+E0001/U+E0002 + ZWSP)과 달랐다. 그래서 문제 본문 등에서
 * 붙여넣을 때마다 보이지 않는 문자 6개가 답안과 붙여넣기 기록에 들어갔다.
 *
 * jsdom 에 실제 컴포넌트를 렌더해 복사 → 붙여넣기를 흉내 낸다. jsdom 에는 DataTransfer 가 없으므로
 * clipboardData 를 가짜 객체로 붙인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { CopyProtector } from "@/components/exam/CopyProtector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PasteInfo = { pastedText: string; pasteStart: number; pasteEnd: number; isInternal: boolean };

class FakeClipboard {
  data = new Map<string, string>();
  get types() {
    return [...this.data.keys()];
  }
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? "";
  }
}

function clipboardEvent(type: "copy" | "paste", clipboard: FakeClipboard) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboard });
  return ev;
}

/** 표식에 쓰이는 보이지 않는 문자(폭 없는 공백, 태그 문자). */
const MARKER_CHAR = /[\u200B\u{E0000}-\u{E007F}]/u;

let container: HTMLDivElement;
let root: Root;
const pastes: PasteInfo[] = [];

function Harness({ initial = "답: " }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return createElement(
    "div",
    null,
    createElement(CopyProtector, null, createElement("p", { id: "question" }, "문제 본문 문장")),
    createElement(AnswerTextarea, {
      value,
      onChange: setValue,
      onPaste: (info: PasteInfo) =>
        pastes.push({
          pastedText: info.pastedText,
          pasteStart: info.pasteStart,
          pasteEnd: info.pasteEnd,
          isInternal: info.isInternal,
        }),
    }),
  );
}

function textarea() {
  return container.querySelector("textarea") as HTMLTextAreaElement;
}

/** 문제 본문을 선택해 복사한다(CopyProtector 의 copy 처리). */
async function copyQuestion() {
  const p = container.querySelector("#question") as HTMLParagraphElement;
  const range = document.createRange();
  range.selectNodeContents(p);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const clip = new FakeClipboard();
  await act(async () => {
    p.dispatchEvent(clipboardEvent("copy", clip));
  });
  selection.removeAllRanges();
  return clip;
}

async function pasteAtEnd(clip: FakeClipboard) {
  const ta = textarea();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  await act(async () => {
    ta.dispatchEvent(clipboardEvent("paste", clip));
  });
}

function inputEvent(type: "beforeinput" | "input", inputType: string, data: string | null = null) {
  return new InputEvent(type, { bubbles: true, cancelable: type === "beforeinput", inputType, data });
}

/** React 가 감시하는 value setter 를 건너뛰어야 input 이벤트에서 onChange 가 불린다(브라우저가 값을 바꾼 것처럼). */
function setNativeValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
}

/**
 * 바깥에서 끌어 온 글을 답안 끝에 놓는다. 브라우저는 text/plain 을 그대로(표식 문자까지) 넣고 넣은 글을
 * 선택한다(Chromium). 이벤트 순서는 #561 테스트와 같다.
 */
async function dropAtEnd(text: string) {
  const ta = textarea();
  const data = new FakeClipboard();
  data.setData("text/plain", text);
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: data });
  await act(async () => {
    const at = ta.value.length;
    ta.dispatchEvent(drop);
    ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", text));
    setNativeValue(ta, ta.value + text);
    ta.setSelectionRange(at, at + text.length);
    ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
  });
  // 표식 정리는 브라우저가 넣은 값을 React 가 반영한 다음 타이머에서 한다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  pastes.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Harness));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("답안 칸 붙여넣기 표식 제거 (#555)", () => {
  it("문제 본문에서 복사해 붙이면 내부 복사로 기록되고, 답안과 기록에 표식 문자가 남지 않는다", async () => {
    const clip = await copyQuestion();
    await pasteAtEnd(clip);

    expect(textarea().value).toBe("답: 문제 본문 문장");
    expect(textarea().value).not.toMatch(MARKER_CHAR);
    expect(pastes).toEqual([{ pastedText: "문제 본문 문장", pasteStart: 3, pasteEnd: 11, isInternal: true }]);
  });

  it("사용자 정의 형식이 없어져도(다른 브라우저로 붙이기 등) 표식 문자로 내부 복사를 알아보고 지운다", async () => {
    const copied = await copyQuestion();
    const textOnly = new FakeClipboard();
    textOnly.setData("text/plain", copied.getData("text/plain"));
    await pasteAtEnd(textOnly);

    expect(textarea().value).toBe("답: 문제 본문 문장");
    expect(pastes[0]).toMatchObject({ pastedText: "문제 본문 문장", isInternal: true });
  });

  it("고치기 전 문제 본문 표식(폭 없는 공백 3개)이 클립보드에 남아 있어도 지운다", async () => {
    const legacy = new FakeClipboard();
    legacy.setData("text/plain", "\u200B\u200B\u200B옛 화면에서 복사한 글\u200B\u200B\u200B");
    legacy.setData("application/x-queston-internal", "true");
    await pasteAtEnd(legacy);

    // 이 테스트는 지우기만 본다. 옛 형식을 내부로 볼지는 표식 판정의 몫이다(#560 은 세션 범위가 없는 옛 형식을 외부로 본다).
    expect(textarea().value).toBe("답: 옛 화면에서 복사한 글");
    expect(pastes[0].pastedText).toBe("옛 화면에서 복사한 글");
  });

  it("답안 칸에서 복사한 글을 붙여도 표식 문자가 남지 않는다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 2); // "답:"
    const clip = new FakeClipboard();
    await act(async () => {
      ta.dispatchEvent(clipboardEvent("copy", clip));
    });
    await pasteAtEnd(clip);

    expect(textarea().value).toBe("답: 답:");
    expect(pastes[0]).toMatchObject({ pastedText: "답:", isInternal: true });
  });

  it("표식이 없는 바깥 글은 그대로 외부 붙여넣기다", async () => {
    const clip = new FakeClipboard();
    clip.setData("text/plain", "다른 곳의 글");
    await pasteAtEnd(clip);

    expect(textarea().value).toBe("답: 다른 곳의 글");
    expect(pastes[0]).toMatchObject({ pastedText: "다른 곳의 글", isInternal: false });
  });
});

describe("답안 칸 끌어다 놓기 표식 제거 (#555, #561 리뷰)", () => {
  it("끌어다 놓은 글에 표식 문자가 섞여 있어도 답안과 기록에 남지 않는다", async () => {
    // 표식이 든 글: 답안 칸에서 복사한 글을 채팅 입력에 붙여 보낸 메시지를 다시 끌어오는 경우 등.
    await dropAtEnd("\u200B\u{E0001}\u200B끌어온 글\u200B\u{E0002}\u200B");

    expect(textarea().value).toBe("답: 끌어온 글");
    expect(pastes).toHaveLength(1);
    expect(pastes[0]).toMatchObject({ pastedText: "끌어온 글", pasteStart: 3, pasteEnd: 8 });
  });

  it("고치기 전 문제 본문 표식(폭 없는 공백 3개)도 지운다", async () => {
    await dropAtEnd("\u200B\u200B\u200B옛 표식 글\u200B\u200B\u200B");

    expect(textarea().value).toBe("답: 옛 표식 글");
    expect(pastes[0]).toMatchObject({ pastedText: "옛 표식 글", pasteStart: 3, pasteEnd: 9 });
  });

  it("표식이 없는 글은 브라우저가 넣은 그대로 둔다", async () => {
    await dropAtEnd("바깥 글");

    expect(textarea().value).toBe("답: 바깥 글");
    expect(pastes[0]).toMatchObject({ pastedText: "바깥 글", pasteStart: 3, pasteEnd: 7, isInternal: false });
  });
});

/** 타이머로 미뤄 둔 일이 있으면 다 돌게 한다. */
async function flushTimers() {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 처음 값을 바꿔 답안 칸을 새로 그린다. */
async function remount(initial: string) {
  await act(async () => {
    root.render(createElement(Harness, { key: initial, initial }));
  });
}

describe("놓은 직후 친 글자 (#555 리뷰)", () => {
  it("표식이 든 글을 놓은 직후 친 글자가 지워지지 않고, 표식도 남지 않는다", async () => {
    const ta = textarea();
    const text = "\u200B\u{E0001}\u200B끌어온 글\u200B\u{E0002}\u200B";
    const data = new FakeClipboard();
    data.setData("text/plain", text);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: data });

    // 놓기와 바로 이은 타이핑을, 미뤄 둔 타이머가 돌기 전에 보낸다.
    await act(async () => {
      const at = ta.value.length;
      ta.dispatchEvent(drop);
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", text));
      setNativeValue(ta, ta.value + text);
      ta.setSelectionRange(at, at + text.length);
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));

      ta.dispatchEvent(inputEvent("beforeinput", "insertText", "가"));
      setNativeValue(ta, ta.value + "가");
      ta.dispatchEvent(inputEvent("input", "insertText", "가"));
    });
    await flushTimers();

    expect(textarea().value).toBe("답: 끌어온 글가");
    expect(pastes[0]).toMatchObject({ pastedText: "끌어온 글", pasteStart: 3, pasteEnd: 8 });
  });
});

describe("학생 글은 바꾸지 않는다 (#555 리뷰)", () => {
  // 표식과 같은 문자를 쓰지만 학생 글에 정당하게 들어 있는 것들
  const SAMPLES = [
    ["ZWJ 이모지", "👩\u200D💻"],
    ["깃발 태그 문자열", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"],
    ["URL 속 폭 없는 공백 1개", "https://exam\u200Bple.com/"],
    ["코드 속 폭 없는 공백 2개", "print(\u200B\u200B1)"],
  ] as const;

  it.each(SAMPLES)("%s 는 붙여넣기로 그대로 들어온다", async (_name, sample) => {
    const clip = new FakeClipboard();
    clip.setData("text/plain", sample);
    await pasteAtEnd(clip);

    expect(textarea().value).toBe("답: " + sample);
    expect(pastes[0].pastedText).toBe(sample);
  });

  it.each(SAMPLES)("%s 는 끌어다 놓기로 그대로 들어온다", async (_name, sample) => {
    await dropAtEnd(sample);

    expect(textarea().value).toBe("답: " + sample);
    expect(pastes[0].pastedText).toBe(sample);
  });

  // 고치기 전에 저장된 답안처럼 옛 표식이 이미 남아 있는 답안. 들어온 글만 고치고 이 부분은 그대로 둔다.
  const EXISTING = "옛 답안\u200B\u200B\u200B그대로 ";
  const MARKED = "\u200B\u{E0001}\u200B새 글\u200B\u{E0002}\u200B";

  it("끌어다 놓기는 들어온 구간 밖의 답안 글을 건드리지 않는다", async () => {
    await remount(EXISTING);
    await dropAtEnd(MARKED);

    expect(textarea().value).toBe(EXISTING + "새 글");
    expect(pastes[0]).toMatchObject({ pastedText: "새 글", pasteStart: EXISTING.length, pasteEnd: EXISTING.length + 3 });
  });

  it("붙여넣기도 들어온 구간 밖의 답안 글을 건드리지 않는다", async () => {
    await remount(EXISTING);
    const clip = new FakeClipboard();
    clip.setData("text/plain", MARKED);
    await pasteAtEnd(clip);

    expect(textarea().value).toBe(EXISTING + "새 글");
  });
});
