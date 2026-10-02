/**
 * `useIntegritySignalsPreference` 의 마운트 후 읽기와 쓰기 시점 (이슈 #514).
 *
 * 채점 페이지는 `"use client"` 지만 서버에서도 한 번 렌더된다. localStorage 를 첫
 * 렌더에서 읽으면 서버 HTML(켜짐)과 클라이언트 첫 렌더(꺼짐)가 달라져 하이드레이션
 * 경고가 난다. 그래서 첫 렌더는 항상 기본값(켜짐)이고, 마운트 effect 에서만 읽는다.
 *
 * 렌더러가 없으므로 `agent-page-state-lag.test.ts` 처럼 state/effect 슬롯만 기억하는
 * 최소 훅 런타임으로 훅을 실제 구동한다. setState 는 다음 render() 호출 때 반영된다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => {
  const slots: Record<number, unknown> = {};
  const cursor = { index: 0 };
  let pendingEffects: (() => void)[] = [];
  return {
    slots,
    cursor,
    beginRender() {
      cursor.index = 0;
      pendingEffects = [];
    },
    /** effect 는 커밋에서만 돈다. */
    commit() {
      const effects = pendingEffects;
      pendingEffects = [];
      for (const fn of effects) fn();
    },
    queueEffect(fn: () => void) {
      pendingEffects.push(fn);
    },
    reset() {
      for (const k of Object.keys(slots)) delete slots[Number(k)];
      cursor.index = 0;
      pendingEffects = [];
    },
  };
});

vi.mock("react", () => ({
  useState: (init: unknown) => {
    const i = rt.cursor.index++;
    if (!(i in rt.slots)) rt.slots[i] = { value: init };
    const slot = rt.slots[i] as { value: unknown };
    return [
      slot.value,
      (next: unknown) => {
        slot.value = typeof next === "function" ? (next as (p: unknown) => unknown)(slot.value) : next;
      },
    ];
  },
  useEffect: (fn: () => void, deps?: unknown[]) => {
    const i = rt.cursor.index++;
    const prev = rt.slots[i] as { deps?: unknown[] } | undefined;
    const changed =
      !prev ||
      !deps ||
      !prev.deps ||
      deps.length !== prev.deps.length ||
      deps.some((d, j) => !Object.is(d, prev.deps![j]));
    rt.slots[i] = { deps };
    if (changed) rt.queueEffect(fn);
  },
  useCallback: (fn: unknown) => fn,
}));

async function render(examId: string, opts: { commit?: boolean } = {}) {
  const { useIntegritySignalsPreference } = await import("@/hooks/useIntegritySignalsPreference");
  rt.beginRender();
  const result = useIntegritySignalsPreference(examId);
  if (opts.commit !== false) rt.commit();
  return result;
}

function installStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const setItem = vi.fn((key: string, value: string) => void data.set(key, value));
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem },
  });
  return { data, setItem };
}

describe("useIntegritySignalsPreference", () => {
  beforeEach(() => rt.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("첫 렌더는 저장된 값과 무관하게 켜짐이다 (서버 HTML 과 같아야 한다)", async () => {
    installStorage({ "qon.grade.integrity.exam-1": "false" });
    const [show] = await render("exam-1", { commit: false });
    expect(show).toBe(true);
  });

  it("마운트 effect 가 저장된 꺼짐을 읽어 반영한다", async () => {
    installStorage({ "qon.grade.integrity.exam-1": "false" });
    await render("exam-1"); // 첫 렌더 + 커밋(effect: 읽기)
    const [show] = await render("exam-1"); // 반영된 두 번째 렌더
    expect(show).toBe(false);
  });

  it("저장된 값이 없으면 계속 켜짐이고 마운트만으로는 아무것도 쓰지 않는다", async () => {
    const { data, setItem } = installStorage();
    await render("exam-1");
    const [show] = await render("exam-1");
    expect(show).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("끄면 시험별 키에 즉시 저장하고 다음 렌더에 반영된다", async () => {
    const { data } = installStorage();
    const [, setShow] = await render("exam-1");
    setShow(false);
    expect(data.get("qon.grade.integrity.exam-1")).toBe("false");
    const [show] = await render("exam-1");
    expect(show).toBe(false);
  });

  it("다시 켜면 true 로 저장된다", async () => {
    const { data } = installStorage({ "qon.grade.integrity.exam-1": "false" });
    await render("exam-1");
    const [, setShow] = await render("exam-1");
    setShow(true);
    expect(data.get("qon.grade.integrity.exam-1")).toBe("true");
    const [show] = await render("exam-1");
    expect(show).toBe(true);
  });

  it("다른 시험으로 바뀌면 그 시험의 값을 읽는다 (같은 시험의 다른 학생은 그대로)", async () => {
    installStorage({ "qon.grade.integrity.exam-1": "false" });
    await render("exam-1");
    expect((await render("exam-1"))[0]).toBe(false); // 같은 시험: 유지

    await render("exam-2"); // exam-2 는 저장된 값이 없다
    expect((await render("exam-2"))[0]).toBe(true);
  });

  it("window 가 없어도(서버 렌더) 예외 없이 켜짐이다", async () => {
    // Node 환경에는 window 가 없다. 스텁도 하지 않는다.
    const [show, setShow] = await render("exam-1");
    expect(show).toBe(true);
    expect(() => setShow(false)).not.toThrow();
  });
});
