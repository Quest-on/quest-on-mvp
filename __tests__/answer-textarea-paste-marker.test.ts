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

function Harness() {
  const [value, setValue] = useState("답: ");
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

    expect(textarea().value).toBe("답: 옛 화면에서 복사한 글");
    expect(pastes[0]).toMatchObject({ pastedText: "옛 화면에서 복사한 글", isInternal: true });
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
