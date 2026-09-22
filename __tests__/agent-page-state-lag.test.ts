/**
 * 이슈 #441 — 에이전트가 성공한 작업을 실패로 보고하던 결함의 회귀 테스트.
 *
 * AgentRunController 는 액션 배치가 끝나자마자 `getPageState()` 를 읽어 서버로
 * 보낸다. `setExamTitle` 은 업데이트를 **예약**만 하므로, 그 시점 클로저의
 * `examTitle` 은 아직 이전 값이다 — 마지막 글자가 빠진 제목이 보고되고,
 * 모델은 자기가 쓴 값과 다르니 실패로 단정해 재시도한다. staging 에서
 * "자료구조 중간고사" 를 쓰고 "자료구조 중간고" 로 읽어, 있지도 않은
 * "글자 수 제한" 을 원인으로 지목했다.
 *
 * 렌더러(@testing-library/react·jsdom)가 이 저장소에 없으므로 ref 슬롯만
 * 기억하는 최소 훅 런타임으로 훅을 실제 구동한다. 소스 텍스트를 훑는 게 아니라
 * "쓴 직후 무엇을 보고하는가" 라는 동작 자체를 고정한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 최소 훅 런타임 ────────────────────────────────────────────────
// useRef 만 렌더 간 보존하면 이 훅의 의미가 보존된다. useCallback/useMemo 는
// 메모이제이션이 목적이지 의미가 아니므로 그대로 실행한다.
const rt = vi.hoisted(() => {
  const slots: { current: unknown }[] = [];
  const cursor = { index: 0 };
  return {
    slots,
    cursor,
    /** 한 번의 렌더를 시작한다 — 훅 호출 순서를 처음으로 되감는다. */
    beginRender() {
      cursor.index = 0;
    },
    /** 컴포넌트가 언마운트된 것처럼 ref 를 전부 버린다. */
    reset() {
      slots.length = 0;
      cursor.index = 0;
    },
  };
});

vi.mock("react", () => ({
  useRef: (init: unknown) => {
    const i = rt.cursor.index++;
    if (!rt.slots[i]) rt.slots[i] = { current: init };
    return rt.slots[i];
  },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("@/components/agent/AgentPresenceProvider", () => ({
  useAgentPresence: () => ({
    focusOn: async () => {},
    setActive: () => {},
    setStatusLabel: () => {},
    clear: () => {},
  }),
}));

// 실제 typeText 는 한 글자씩 onChange 를 부른다. 여기서 중요한 건 타이핑
// 연출이 아니라 "onChange(setExamTitle) 가 예약만 한다" 는 사실이므로
// 최종값으로 한 번만 부른다.
const typeTextMock = vi.hoisted(() =>
  vi.fn(
    async ({
      target,
      onChange,
    }: {
      target: string;
      onChange: (v: string) => void;
    }) => {
      onChange(target);
    },
  ),
);

vi.mock("@/components/agent/typeText", () => ({ typeText: typeTextMock }));

type Executor = Awaited<
  ReturnType<typeof importHook>
> extends (deps: never) => infer R
  ? R
  : never;

async function importHook() {
  const mod = await import("@/components/agent/useAgentEditorExecutor");
  return mod.useAgentEditorExecutor;
}

/**
 * 한 번의 렌더. `examTitle` 은 **커밋된** props 값이다 — setExamTitle 을 불러도
 * 여기 값은 다음 render() 호출 전까지 바뀌지 않는다. 그게 이 버그의 전부다.
 */
async function render(examTitle: string): Promise<Executor> {
  const useAgentEditorExecutor = await importHook();
  rt.beginRender();
  return useAgentEditorExecutor({
    examTitle,
    setExamTitle: () => {},
    titleElementRef: { current: null },
    questions: [],
    addQuestion: () => {},
    removeQuestionById: () => {},
    updateQuestion: () => {},
    generatorRef: { current: null },
    route: "/instructor/new",
  }) as Executor;
}

const TITLE = "자료구조 중간고사";

describe("#441 — 에이전트 pageState 가 방금 쓴 제목보다 뒤처지지 않는다", () => {
  beforeEach(() => {
    rt.reset();
  });

  it("제목을 쓴 직후, 리렌더 전에 읽어도 방금 쓴 제목을 보고한다", async () => {
    const executor = await render("");

    const result = await executor.executeAction({
      type: "set_exam_title",
      text: TITLE,
    });
    expect(result.ok).toBe(true);

    // 컨트롤러가 하는 그대로 — 리렌더를 기다리지 않고 즉시 읽는다.
    expect(executor.getPageState().examTitle).toBe(TITLE);
  });

  it("props 가 따라잡은 뒤에도 같은 제목을 보고한다", async () => {
    const first = await render("");
    await first.executeAction({ type: "set_exam_title", text: TITLE });

    // React 가 커밋해 새 props 로 리렌더된 상태.
    const second = await render(TITLE);
    expect(second.getPageState().examTitle).toBe(TITLE);
  });

  it("그 뒤 사용자가 직접 고치면 에이전트 값이 아니라 사용자 값을 보고한다", async () => {
    const first = await render("");
    await first.executeAction({ type: "set_exam_title", text: TITLE });

    // 커밋 → 사용자가 입력란을 직접 수정.
    await render(TITLE);
    const third = await render("사용자가 고친 제목");

    // 예약값을 "일치할 때만" 비우면 여기서 영영 TITLE 을 보고한다 —
    // 원래 버그보다 오래 거짓말하는 쪽이다.
    expect(third.getPageState().examTitle).toBe("사용자가 고친 제목");
  });

  it("typeText 가 중단돼도 최종 제목을 보고한다", async () => {
    typeTextMock.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );

    const executor = await render("");
    const result = await executor.executeAction({
      type: "set_exam_title",
      text: TITLE,
    });

    expect(result.ok).toBe(true);
    expect(executor.getPageState().examTitle).toBe(TITLE);
  });

  it("에이전트가 제목을 건드리지 않았으면 props 를 그대로 보고한다", async () => {
    const executor = await render("손대지 않은 제목");
    expect(executor.getPageState().examTitle).toBe("손대지 않은 제목");
  });
});
