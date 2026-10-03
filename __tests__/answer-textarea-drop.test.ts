// @vitest-environment jsdom
/**
 * 답안 칸에 글을 끌어다 놓아도(drop) 붙여넣기처럼 기록된다(#561).
 *
 * 답안 칸은 paste 이벤트만 기록해서, 다른 창이나 문서에서 끌어다 놓은 글은 아무 기록도 남지 않았다.
 *
 * jsdom 은 끌어다 놓기의 기본 동작(글 넣기)을 하지 않으므로 브라우저가 보내는 이벤트 순서를 그대로
 * 흉내 낸다. 순서는 Chromium·Firefox·WebKit 에서 직접 확인한 것이다.
 *   - drop → (자기 답안 안에서 옮기면 beforeinput/input deleteByDrag) → beforeinput/input insertFromDrop → dragend
 *   - 놓은 뒤 선택 영역: Chromium 은 넣은 글 전체, Firefox 는 넣은 글 끝, WebKit 은 input 시점에 0.
 *   - WebKit 은 beforeinput 두 개가 먼저 오고 input 두 개가 뒤에 온다(input 때 값은 이미 최종값).
 * jsdom 에는 DataTransfer 가 없으므로 dataTransfer 를 가짜 객체로 붙인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { CopyProtector } from "@/components/exam/CopyProtector";
import {
  endInternalDrag,
  isInternalDrag,
  locateInsertedText,
  startInternalDrag,
} from "@/lib/answer-drop";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PasteInfo = {
  pastedText: string;
  pasteStart: number;
  pasteEnd: number;
  answerLengthBefore: number;
  answerTextBefore: string;
  isInternal: boolean;
};

class FakeDataTransfer {
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

function dragEvent(type: "dragstart" | "drop" | "dragend", data = new FakeDataTransfer()) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: data });
  return ev;
}

function textData(text: string) {
  const dt = new FakeDataTransfer();
  dt.setData("text/plain", text);
  return dt;
}

function inputEvent(type: "beforeinput" | "input", inputType: string, data: string | null = null) {
  return new InputEvent(type, { bubbles: true, cancelable: type === "beforeinput", inputType, data });
}

/** React 가 감시하는 value setter 를 건너뛰어야 input 이벤트에서 onChange 가 불린다(브라우저가 값을 바꾼 것처럼). */
function setNativeValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
}

let container: HTMLDivElement;
let root: Root;
const pastes: PasteInfo[] = [];

/** `showQuestion` 을 끄면 문제 본문(CopyProtector)만 사라진다(문항 전환). 답안 칸은 그대로 남는다. */
function Harness({ initial, showQuestion = true }: { initial: string; showQuestion?: boolean }) {
  const [value, setValue] = useState(initial);
  return createElement(
    "div",
    null,
    showQuestion
      ? createElement(
          CopyProtector,
          null,
          createElement("p", { id: "question" }, "문제 본문 문장입니다."),
          createElement("a", { id: "link", href: "https://example.com/" }, "자료 링크"),
        )
      : null,
    createElement(AnswerTextarea, {
      value,
      onChange: setValue,
      onPaste: (info: PasteInfo) => pastes.push({ ...info }),
    }),
  );
}

function textarea() {
  return container.querySelector("textarea") as HTMLTextAreaElement;
}

function question() {
  return container.querySelector("#question") as HTMLParagraphElement;
}

function selectContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** 바깥(다른 창·문서)에서 끌어 온 글을 `at` 위치에 놓는다. Chromium 처럼 넣은 글이 선택된다. */
async function dropFromOutside(text: string, at: number) {
  const ta = textarea();
  const drop = dragEvent("drop", textData(text));
  await act(async () => {
    ta.dispatchEvent(drop);
    ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", text));
    setNativeValue(ta, ta.value.slice(0, at) + text + ta.value.slice(at));
    ta.setSelectionRange(at, at + text.length);
    ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
  });
  return drop;
}

beforeEach(async () => {
  pastes.length = 0;
  endInternalDrag();
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
  window.getSelection()?.removeAllRanges();
});

describe("답안 칸 끌어다 놓기 기록 (#561)", () => {
  it("바깥에서 끌어다 놓은 글은 외부 붙여넣기로 기록되고, 넣기는 브라우저에 맡긴다", async () => {
    const drop = await dropFromOutside("다른 창의 글", 5);

    expect(drop.defaultPrevented).toBe(false);
    expect(textarea().value).toBe("첫 문장.다른 창의 글 둘째 문장.");
    expect(pastes).toEqual([
      {
        pastedText: "다른 창의 글",
        pasteStart: 5,
        pasteEnd: 12,
        answerLengthBefore: 12,
        answerTextBefore: "첫 문장. 둘째 문장.",
        isInternal: false,
      },
    ]);
  });

  it("문제 본문(시험 화면 안)에서 끌어 온 글은 내부 복사로 기록된다", async () => {
    const p = question();
    selectContents(p);
    await act(async () => {
      p.dispatchEvent(dragEvent("dragstart"));
    });

    // 브라우저 직렬화는 줄바꿈을 CRLF 로 줄 수 있고, textarea 는 LF 로 바꿔 넣는다.
    const ta = textarea();
    await act(async () => {
      ta.dispatchEvent(dragEvent("drop", textData("문제 본문 문장입니다.\r\n")));
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", "문제 본문 문장입니다.\r\n"));
      setNativeValue(ta, "문제 본문 문장입니다.\n" + ta.value);
      ta.setSelectionRange(13, 13); // Firefox: 넣은 글 끝에 커서
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
      p.dispatchEvent(dragEvent("dragend"));
    });

    expect(textarea().value).toBe("문제 본문 문장입니다.\n첫 문장. 둘째 문장.");
    expect(pastes).toHaveLength(1);
    expect(pastes[0]).toMatchObject({
      pastedText: "문제 본문 문장입니다.\n",
      pasteStart: 0,
      pasteEnd: 13,
      isInternal: true,
    });
  });

  it("답안 안에서 끌어 옮기면 글이 옮겨지고(복제되지 않고) 내부 복사로 기록된다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 5); // "첫 문장."
    const dragstart = dragEvent("dragstart");
    const drop = dragEvent("drop", textData("첫 문장."));
    await act(async () => {
      ta.dispatchEvent(dragstart);
      ta.dispatchEvent(drop);
      // Chromium·Firefox: 지우기와 넣기가 각각 beforeinput → input 으로 온다.
      ta.dispatchEvent(inputEvent("beforeinput", "deleteByDrag"));
      setNativeValue(ta, " 둘째 문장.");
      ta.setSelectionRange(0, 0);
      ta.dispatchEvent(inputEvent("input", "deleteByDrag"));
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", "첫 문장."));
      setNativeValue(ta, " 둘째 문장.첫 문장.");
      ta.setSelectionRange(7, 12);
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
      ta.dispatchEvent(dragEvent("dragend"));
    });

    expect(dragstart.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(textarea().value).toBe(" 둘째 문장.첫 문장.");
    expect(pastes).toEqual([
      {
        pastedText: "첫 문장.",
        pasteStart: 7,
        pasteEnd: 12,
        answerLengthBefore: 7,
        answerTextBefore: " 둘째 문장.",
        isInternal: true,
      },
    ]);
  });

  it("WebKit 순서(beforeinput 둘 → input 둘, 커서 0)로 와도 옮긴 위치와 글을 맞게 기록한다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 5);
    await act(async () => {
      ta.dispatchEvent(dragEvent("dragstart"));
      ta.dispatchEvent(dragEvent("drop", textData("첫 문장.")));
      ta.dispatchEvent(inputEvent("beforeinput", "deleteByDrag"));
      setNativeValue(ta, " 둘째 문장.");
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", "첫 문장."));
      setNativeValue(ta, " 둘째 문장.첫 문장.");
      ta.setSelectionRange(0, 0);
      ta.dispatchEvent(inputEvent("input", "deleteByDrag"));
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
      ta.dispatchEvent(dragEvent("dragend"));
    });

    expect(textarea().value).toBe(" 둘째 문장.첫 문장.");
    expect(pastes).toHaveLength(1);
    expect(pastes[0]).toMatchObject({ pastedText: "첫 문장.", pasteStart: 7, pasteEnd: 12, isInternal: true });
  });

  it("끌기 표시가 남아 있어도(dragend 누락) 다른 글을 놓으면 외부로 기록된다", async () => {
    const p = question();
    selectContents(p);
    await act(async () => {
      p.dispatchEvent(dragEvent("dragstart"));
    });
    // dragend 없이 바깥 글을 놓는다.
    await dropFromOutside("바깥 AI 답", 0);

    expect(pastes).toHaveLength(1);
    expect(pastes[0].isInternal).toBe(false);
  });

  it("타이핑은 기록하지 않는다", async () => {
    const ta = textarea();
    await act(async () => {
      ta.dispatchEvent(inputEvent("beforeinput", "insertText", "가"));
      setNativeValue(ta, ta.value + "가");
      ta.dispatchEvent(inputEvent("input", "insertText", "가"));
    });

    expect(textarea().value).toBe("첫 문장. 둘째 문장.가");
    expect(pastes).toEqual([]);
  });

  it("놓기가 거절돼 글이 들어오지 않으면 기록하지 않고, 다음 입력을 놓기로 오인하지 않는다", async () => {
    const ta = textarea();
    await act(async () => {
      ta.dispatchEvent(dragEvent("drop", textData("거절된 글")));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      setNativeValue(ta, ta.value + "가");
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
    });

    expect(pastes).toEqual([]);
  });

  it("붙여넣기 기록은 그대로다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 0);
    const clip = textData("붙여넣은 글");
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: clip });
    await act(async () => {
      ta.dispatchEvent(ev);
    });

    expect(pastes).toHaveLength(1);
    expect(pastes[0]).toMatchObject({ pastedText: "붙여넣은 글", pasteStart: 0, isInternal: false });
  });
});

describe("끌기 표시 정리와 끌기 글 맞추기 (#561 리뷰)", () => {
  it("문제 본문에서 선택 영역을 끌면 끌기 글을 선택 글로 맞춰, 브라우저 직렬화가 달라도 내부로 기록된다", async () => {
    const p = question();
    selectContents(p);
    // 브라우저가 만든 끌기 글이 selection.toString() 과 다르게 직렬화됐다고 친다(수식, 이미지 대체 글 등).
    const dt = textData("문제 본문 [수식] 문장입니다.");
    await act(async () => {
      p.dispatchEvent(dragEvent("dragstart", dt));
    });
    expect(dt.getData("text/plain")).toBe("문제 본문 문장입니다.");

    const dropped = dt.getData("text/plain");
    const ta = textarea();
    await act(async () => {
      ta.dispatchEvent(dragEvent("drop", textData(dropped)));
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", dropped));
      setNativeValue(ta, dropped + ta.value);
      ta.setSelectionRange(dropped.length, dropped.length);
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
      p.dispatchEvent(dragEvent("dragend", dt));
    });

    expect(pastes).toHaveLength(1);
    expect(pastes[0]).toMatchObject({ pastedText: "문제 본문 문장입니다.", isInternal: true });
  });

  it("선택 밖의 링크를 끌면 끌기 데이터를 건드리지 않고 내부로 표시하지도 않는다", async () => {
    selectContents(question());
    const link = container.querySelector("#link") as HTMLAnchorElement;
    const dt = textData("https://example.com/");
    await act(async () => {
      link.dispatchEvent(dragEvent("dragstart", dt));
    });
    expect(dt.getData("text/plain")).toBe("https://example.com/");

    // 선택 글과 같은 글을 바깥에서 놓아도 내부가 아니다(표시가 없다).
    await dropFromOutside("문제 본문 문장입니다.", 0);
    expect(pastes[0].isInternal).toBe(false);
  });

  it("CopyProtector 에서 시작한 끌기가 dragend 로 끝나면 표시가 지워진다", async () => {
    const p = question();
    selectContents(p);
    await act(async () => {
      p.dispatchEvent(dragEvent("dragstart"));
      p.dispatchEvent(dragEvent("dragend"));
    });
    await dropFromOutside("문제 본문 문장입니다.", 0);

    expect(pastes[0].isInternal).toBe(false);
  });

  it("끌기 도중 CopyProtector 가 사라지면(문항 전환) 표시가 지워진다", async () => {
    const p = question();
    selectContents(p);
    await act(async () => {
      p.dispatchEvent(dragEvent("dragstart"));
    });
    await act(async () => {
      root.render(createElement(Harness, { initial: "첫 문장. 둘째 문장.", showQuestion: false }));
    });
    expect(container.querySelector("#question")).toBeNull();

    await dropFromOutside("문제 본문 문장입니다.", 0);
    expect(pastes[0].isInternal).toBe(false);
  });

  it("답안 칸이 사라지면 끌어다 놓기 리스너가 떨어지고, 답안 칸에서 시작한 끌기 표시도 지워진다", async () => {
    const ta = textarea();
    ta.setSelectionRange(0, 5); // "첫 문장."
    await act(async () => {
      ta.dispatchEvent(dragEvent("dragstart"));
    });
    await act(async () => {
      root.render(createElement("div"));
    });

    // 화면에서 떨어진 답안 칸에 이벤트가 와도 기록하지 않는다.
    await act(async () => {
      ta.dispatchEvent(dragEvent("drop", textData("첫 문장.")));
      ta.dispatchEvent(inputEvent("beforeinput", "insertFromDrop", "첫 문장."));
      setNativeValue(ta, "첫 문장." + ta.value);
      ta.dispatchEvent(inputEvent("input", "insertFromDrop"));
    });
    expect(pastes).toEqual([]);

    // 새 답안 칸에 같은 글을 바깥에서 놓으면 외부다(옛 답안 칸의 끌기 표시가 남지 않았다).
    await act(async () => {
      root.render(createElement(Harness, { initial: "" }));
    });
    await dropFromOutside("첫 문장.", 0);
    expect(pastes).toHaveLength(1);
    expect(pastes[0].isInternal).toBe(false);
  });
});

describe("들어온 구간 찾기 (locateInsertedText)", () => {
  it("넣은 글 끝 커서(Chromium·Firefox)로 위치를 정한다", () => {
    // "abc" 에 "bx" 를 1 에 넣으면 "abxbc". 앞뒤 비교만으로는 "xb"(2) 로도 읽힌다.
    expect(locateInsertedText("abc", "abxbc", 3, "")).toEqual({ start: 1, end: 3 });
  });

  it("커서가 쓸모없으면(WebKit) 브라우저가 넣으려던 글로 위치를 고른다", () => {
    expect(locateInsertedText("abc", "abxbc", 0, "bx")).toEqual({ start: 1, end: 3 });
    expect(locateInsertedText("abc", "abxbc", 0, "xb")).toEqual({ start: 2, end: 4 });
  });

  it("단서가 없으면 가능한 위치 중 하나를 고른다(어느 것이든 결과 문자열은 같다)", () => {
    const range = locateInsertedText("aaaa", "aaaaaa", 0, "")!;
    expect("aaaa".slice(0, range.start) + "aa" + "aaaa".slice(range.start)).toBe("aaaaaa");
    expect(range.end - range.start).toBe(2);
  });

  it("CRLF 단서는 LF 로 맞춰 비교한다", () => {
    expect(locateInsertedText("ab", "a\nxb", 0, "\r\nx")).toEqual({ start: 1, end: 3 });
  });

  it("순수 삽입이 아니면(넣으면서 옆 글자도 바뀐 경우) 바뀐 구간 전체를 돌려준다", () => {
    // "a b" → "aX-b": X 가 들어오면서 공백이 "-" 로 바뀌었다.
    expect(locateInsertedText("a b", "aX-b", 0, "X")).toEqual({ start: 1, end: 3 });
  });

  it("길이가 늘지 않았으면 들어온 글이 없다", () => {
    expect(locateInsertedText("abc", "abc", 3, "x")).toBeNull();
    expect(locateInsertedText("abc", "ab", 2, "")).toBeNull();
  });
});

describe("시험 화면 안 끌기 표시", () => {
  it("공백 차이는 무시하고 같은 글일 때만 내부로 본다", () => {
    startInternalDrag("문제\n본문  입니다");
    expect(isInternalDrag("문제\r\n본문 입니다")).toBe(true);
    expect(isInternalDrag("다른 글")).toBe(false);
    endInternalDrag();
    expect(isInternalDrag("문제\n본문  입니다")).toBe(false);
  });

  it("빈 선택(이미지·링크 끌기)은 표시하지 않는다", () => {
    startInternalDrag("   ");
    expect(isInternalDrag("")).toBe(false);
    expect(isInternalDrag(" ")).toBe(false);
  });
});
