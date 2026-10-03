// @vitest-environment jsdom
/**
 * 답안 칸에서 잘라내기(Ctrl+X)로 옮긴 본인 글은 내부 복사로 기록된다(#554).
 *
 * 답안 칸은 copy 에만 내부 표식을 붙이고 있어서, 잘라내 다른 위치에 붙인 자기 글이 외부
 * 붙여넣기(의심)로 기록됐다. jsdom 에 실제 컴포넌트를 렌더해 cut → paste 를 흉내 낸다.
 * jsdom 에는 DataTransfer 가 없으므로 clipboardData 를 가짜 객체로 붙인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { AnswerTextarea } from "@/components/ui/answer-textarea";

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

function clipboardEvent(type: "cut" | "copy" | "paste", clipboard: FakeClipboard) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboard });
  return ev;
}

let container: HTMLDivElement;
let root: Root;
const pastes: PasteInfo[] = [];

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return createElement(AnswerTextarea, {
    value,
    onChange: setValue,
    onPaste: (info: PasteInfo) => pastes.push({ pastedText: info.pastedText, isInternal: info.isInternal }),
  });
}

function textarea() {
  return container.querySelector("textarea") as HTMLTextAreaElement;
}

beforeEach(async () => {
  pastes.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Harness, { initial: "첫 문장. 둘째 문장." }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("답안 칸 잘라내기 (#554)", () => {
  it("잘라내기는 선택 영역을 지우고 클립보드에 내부 표식을 붙인다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 5); // "첫 문장."
    const clip = new FakeClipboard();
    const ev = clipboardEvent("cut", clip);
    await act(async () => {
      ta.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(textarea().value).toBe(" 둘째 문장.");
    expect(clip.types).toContain("application/x-queston-internal");
    expect(clip.getData("text/plain")).toContain("첫 문장.");
  });

  it("잘라낸 글을 다시 붙이면 내부 복사로 기록되고 표식 문자는 답안에 남지 않는다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 5);
    const clip = new FakeClipboard();
    await act(async () => {
      ta.dispatchEvent(clipboardEvent("cut", clip));
    });
    const after = textarea();
    after.setSelectionRange(after.value.length, after.value.length);
    await act(async () => {
      after.dispatchEvent(clipboardEvent("paste", clip));
    });
    expect(pastes).toHaveLength(1);
    expect(pastes[0].isInternal).toBe(true);
    expect(pastes[0].pastedText).toBe("첫 문장.");
    expect(textarea().value).toBe(" 둘째 문장.첫 문장.");
  });

  it("선택 영역이 없으면 잘라내기를 건드리지 않는다", async () => {
    const ta = textarea();
    ta.setSelectionRange(2, 2);
    const clip = new FakeClipboard();
    const ev = clipboardEvent("cut", clip);
    await act(async () => {
      ta.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(textarea().value).toBe("첫 문장. 둘째 문장.");
    expect(clip.types).toEqual([]);
  });

  it("바깥에서 온 글은 여전히 외부 붙여넣기다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 0);
    const clip = new FakeClipboard();
    clip.setData("text/plain", "다른 곳에서 온 글");
    await act(async () => {
      ta.dispatchEvent(clipboardEvent("paste", clip));
    });
    expect(pastes).toHaveLength(1);
    expect(pastes[0].isInternal).toBe(false);
  });
});
