// @vitest-environment jsdom
/**
 * 내부 복사 표식은 시험 응시 화면에서, 같은 시험 세션 안에서 복사한 글에만 인정된다(#560).
 *
 * 채팅 메시지 복사 버튼(`CopyMessageButton`)은 시험 밖 화면(과제 AI 대화, 과제 기록, 시험 리포트,
 * 교수 화면)에도 있는데 답안 칸과 같은 내부 표식을 붙였다. 그래서 그 화면에서 복사해 시험 답안에
 * 붙인 글이 내부 복사(파란색, 의심 아님)로 기록됐다.
 *
 * jsdom 에 실제 컴포넌트를 렌더해 복사 → 붙여넣기를 흉내 낸다. jsdom 에는 DataTransfer 와
 * navigator.clipboard 가 없으므로 가짜 객체를 붙인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { CopyMessageButton } from "@/components/chat/CopyMessageButton";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { InternalCopyScopeProvider } from "@/components/providers/InternalCopyScopeProvider";
import {
  INTERNAL_COPY_MIME_TYPE,
  internalCopyMimeValue,
  internalCopyScope,
  isInternalCopyFor,
  stripInternalCopyMarkers,
  wrapInternalCopy,
} from "@/lib/internal-copy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PasteInfo = { pastedText: string; isInternal: boolean };

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

function clipboardEvent(type: "copy" | "cut" | "paste", clipboard: FakeClipboard) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboard });
  return ev;
}

/** 표식 문자(폭 없는 공백, 태그 문자)가 섞였는가. */
const HAS_MARKER_CHAR = /[\u200B\u{E0000}-\u{E007F}]/u;

let container: HTMLDivElement;
let root: Root;
let written: string[];
const pastes: Record<string, PasteInfo[]> = {};

function Answer({ id, initial = "" }: { id: string; initial?: string }) {
  const [value, setValue] = useState(initial);
  return createElement(
    "div",
    { id },
    createElement(AnswerTextarea, {
      value,
      onChange: setValue,
      onPaste: (info: PasteInfo) => (pastes[id] ??= []).push({ pastedText: info.pastedText, isInternal: info.isInternal }),
    }),
  );
}

/** 시험 응시 화면 하나(세션 하나). */
function Exam({ sessionId, children }: { sessionId: string; children?: ReactNode }) {
  return createElement(InternalCopyScopeProvider, { sessionId, children });
}

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

function textareaIn(id: string) {
  return container.querySelector(`#${id} textarea`) as HTMLTextAreaElement;
}

async function clickCopyButton(scopeId: string) {
  const button = container.querySelector(`#${scopeId} button`) as HTMLButtonElement;
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return written[written.length - 1];
}

async function pasteInto(id: string, clipboard: FakeClipboard) {
  const ta = textareaIn(id);
  ta.setSelectionRange(ta.value.length, ta.value.length);
  await act(async () => {
    ta.dispatchEvent(clipboardEvent("paste", clipboard));
  });
  return pastes[id]?.[pastes[id].length - 1];
}

function textClipboard(text: string) {
  const clip = new FakeClipboard();
  clip.setData("text/plain", text);
  return clip;
}

/** 답안 칸에서 [start, end) 를 복사한다. */
async function copyFromAnswer(id: string, start: number, end: number) {
  const ta = textareaIn(id);
  ta.setSelectionRange(start, end);
  const clip = new FakeClipboard();
  await act(async () => {
    ta.dispatchEvent(clipboardEvent("copy", clip));
  });
  return clip;
}

/** 문제 본문(CopyProtector) 안의 글을 선택해 복사한다. */
async function copyFromProtected(id: string) {
  const node = container.querySelector(`#${id}`) as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const clip = new FakeClipboard();
  await act(async () => {
    node.dispatchEvent(clipboardEvent("copy", clip));
  });
  selection.removeAllRanges();
  return clip;
}

beforeEach(() => {
  written = [];
  for (const key of Object.keys(pastes)) delete pastes[key];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        written.push(text);
      }),
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("채팅 복사 버튼의 내부 표식 범위 (#560)", () => {
  it("시험 밖 화면의 복사 버튼은 표식 없이 글만 복사한다", async () => {
    await render(createElement("div", { id: "outside" }, createElement(CopyMessageButton, { text: "과제 AI 의 답" })));

    const copied = await clickCopyButton("outside");

    expect(copied).toBe("과제 AI 의 답");
    expect(copied).not.toMatch(HAS_MARKER_CHAR);
  });

  it("시험 밖 화면에서 복사 버튼으로 옮긴 글을 시험 답안에 붙이면 외부 붙여넣기다", async () => {
    await render(
      createElement(
        "div",
        null,
        createElement("div", { id: "outside" }, createElement(CopyMessageButton, { text: "과제 AI 의 답" })),
        createElement(Answer, { id: "exam" }),
      ),
    );

    const copied = await clickCopyButton("outside");
    const paste = await pasteInto("exam", textClipboard(copied));

    expect(paste).toEqual({ pastedText: "과제 AI 의 답", isInternal: false });
  });

  it("응시 중인 시험(세션 범위 있음)의 답안에 붙여도 시험 밖에서 복사한 글은 외부다", async () => {
    await render(
      createElement(
        "div",
        null,
        createElement("div", { id: "outside" }, createElement(CopyMessageButton, { text: "과제 AI 의 답" })),
        createElement(Exam, { sessionId: "session-a" }, createElement(Answer, { id: "exam" })),
      ),
    );

    const copied = await clickCopyButton("outside");
    const paste = await pasteInto("exam", textClipboard(copied));

    expect(paste).toEqual({ pastedText: "과제 AI 의 답", isInternal: false });
  });

  it("시험 응시 화면의 복사 버튼은 세션 범위 표식을 붙이고, 같은 세션 답안에 붙이면 내부 복사다", async () => {
    await render(
      createElement(
        Exam,
        { sessionId: "session-a" },
        createElement("div", { id: "chat" }, createElement(CopyMessageButton, { text: "시험 AI 의 답" })),
        createElement(Answer, { id: "exam" }),
      ),
    );

    const copied = await clickCopyButton("chat");
    expect(copied).toMatch(HAS_MARKER_CHAR);

    const paste = await pasteInto("exam", textClipboard(copied));
    expect(paste).toEqual({ pastedText: "시험 AI 의 답", isInternal: true });
    expect(textareaIn("exam").value).toBe("시험 AI 의 답");
  });

  it("다른 시험 세션에서 복사 버튼으로 옮긴 글은 외부 붙여넣기다", async () => {
    await render(
      createElement(
        "div",
        null,
        createElement(
          Exam,
          { sessionId: "session-a" },
          createElement("div", { id: "chat-a" }, createElement(CopyMessageButton, { text: "다른 시험 AI 의 답" })),
        ),
        createElement(Exam, { sessionId: "session-b" }, createElement(Answer, { id: "exam-b" })),
      ),
    );

    const copied = await clickCopyButton("chat-a");
    const paste = await pasteInto("exam-b", textClipboard(copied));

    expect(paste).toEqual({ pastedText: "다른 시험 AI 의 답", isInternal: false });
    expect(textareaIn("exam-b").value).not.toMatch(HAS_MARKER_CHAR);
  });
});

describe("답안 칸·문제 본문 복사의 세션 범위 (#560)", () => {
  async function renderTwoSessions() {
    await render(
      createElement(
        "div",
        null,
        createElement(
          Exam,
          { sessionId: "session-a" },
          createElement(CopyProtector, null, createElement("p", { id: "question-a" }, "세션 A 문제 본문")),
          createElement(Answer, { id: "answer-a", initial: "세션 A 답안" }),
        ),
        createElement(Exam, { sessionId: "session-b" }, createElement(Answer, { id: "answer-b" })),
      ),
    );
  }

  it("답안 칸에서 복사한 글은 같은 세션에서만 내부 복사다", async () => {
    await renderTwoSessions();
    const clip = await copyFromAnswer("answer-a", 0, 4); // "세션 A"

    expect(await pasteInto("answer-b", clip)).toEqual({ pastedText: "세션 A", isInternal: false });
    expect(await pasteInto("answer-a", clip)).toEqual({ pastedText: "세션 A", isInternal: true });
  });

  it("문제 본문(CopyProtector)에서 복사한 글은 같은 세션에서만 내부 복사다", async () => {
    await renderTwoSessions();
    const clip = await copyFromProtected("question-a");

    expect(clip.types).toContain(INTERNAL_COPY_MIME_TYPE);
    expect((await pasteInto("answer-b", clip))?.isInternal).toBe(false);
    expect((await pasteInto("answer-a", clip))?.isInternal).toBe(true);
  });

  it("#560 이전 형식(범위 없는 표식, 형식 값 \"1\"·\"true\")은 시험 세션 답안에서 외부이고 표식은 지워진다", async () => {
    await renderTwoSessions();
    const legacy = new FakeClipboard();
    legacy.setData("text/plain", "\u200B\u{E0001}\u200B옛 표식 글\u200B\u{E0002}\u200B");
    legacy.setData(INTERNAL_COPY_MIME_TYPE, "1");

    expect(await pasteInto("answer-b", legacy)).toEqual({ pastedText: "옛 표식 글", isInternal: false });

    const legacyTrue = textClipboard("다른 글");
    legacyTrue.setData(INTERNAL_COPY_MIME_TYPE, "true");
    expect((await pasteInto("answer-b", legacyTrue))?.isInternal).toBe(false);
  });
});

describe("lib/internal-copy", () => {
  it("범위는 세션 id 마다 다르고, 같은 id 면 같다(16진수 8자리)", () => {
    expect(internalCopyScope("session-a")).toBe(internalCopyScope("session-a"));
    expect(internalCopyScope("session-a")).not.toBe(internalCopyScope("session-b"));
    expect(internalCopyScope("4f1c2b9e-0d8a-4a77-9a51-2f3e8d7c6b5a")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("표식은 보이지 않는 문자로만 이뤄지고, 범위와 상관없이 지워진다", () => {
    const scope = internalCopyScope("session-a");
    const wrapped = wrapInternalCopy("본문", scope);
    const marker = wrapped.replace("본문", "");

    expect(marker.length).toBeGreaterThan(0);
    expect([...marker].every((ch) => HAS_MARKER_CHAR.test(ch))).toBe(true);
    expect(stripInternalCopyMarkers(wrapped)).toBe("본문");
    expect(stripInternalCopyMarkers(wrapInternalCopy("본문", internalCopyScope("session-b")))).toBe("본문");
    expect(stripInternalCopyMarkers(wrapInternalCopy("본문", ""))).toBe("본문");
  });

  it("표식 문자나 형식 값 중 하나라도 범위가 같으면 내부다", () => {
    const a = internalCopyScope("session-a");
    const b = internalCopyScope("session-b");

    expect(isInternalCopyFor(textClipboard(wrapInternalCopy("글", a)), a)).toBe(true);
    expect(isInternalCopyFor(textClipboard(wrapInternalCopy("글", a)), b)).toBe(false);

    const mimeOnly = textClipboard("글");
    mimeOnly.setData(INTERNAL_COPY_MIME_TYPE, internalCopyMimeValue(a));
    expect(isInternalCopyFor(mimeOnly, a)).toBe(true);
    expect(isInternalCopyFor(mimeOnly, b)).toBe(false);

    expect(isInternalCopyFor(textClipboard("표식 없는 글"), a)).toBe(false);
  });
});
