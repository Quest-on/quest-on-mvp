/**
 * `useIntegritySignalsPreference` 의 읽기 시점과 구독 (이슈 #514).
 *
 * 훅은 `useSyncExternalStore` 로 localStorage 를 읽는다. 클라이언트 렌더에서는
 * `getSnapshot` 이 **첫 렌더부터** 저장값을 돌려주므로, react-query 캐시로 같은 시험의
 * 다른 학생 페이지에 다시 들어올 때(데이터가 첫 렌더에 이미 있다) "켜짐 → 꺼짐" 깜빡임이
 * 없다. 서버 렌더와 하이드레이션은 `getServerSnapshot`(켜짐)을 쓴다 — 그건 실제 React 로
 * 렌더하는 `integrity-signals-ssr.test.ts` 가 본다.
 *
 * 렌더러가 없으므로 `agent-page-state-lag.test.ts` 처럼 훅 슬롯만 기억하는 최소 런타임으로
 * 훅을 구동한다. `useSyncExternalStore` 는 의미를 그대로 흉내 낸다: 렌더에서 getSnapshot() 을
 * 읽고, 커밋 때 subscribe 하며, 스토어가 알리면 다음 render() 가 새 값을 읽는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => {
  const slots: Record<number, unknown> = {};
  const cursor = { index: 0 };
  let pendingEffects: (() => void)[] = [];
  const cleanups: (() => void)[] = [];
  const state = { storeNotifications: 0 };
  return {
    slots,
    cursor,
    state,
    beginRender() {
      cursor.index = 0;
      pendingEffects = [];
    },
    /** 구독 같은 effect 는 커밋에서만 돈다. */
    commit() {
      const effects = pendingEffects;
      pendingEffects = [];
      for (const fn of effects) fn();
    },
    queueEffect(fn: () => void) {
      pendingEffects.push(fn);
    },
    addCleanup(fn: () => void) {
      cleanups.push(fn);
    },
    /** 컴포넌트 언마운트: 구독을 전부 해제한다. */
    unmount() {
      while (cleanups.length) cleanups.pop()!();
    },
    reset() {
      for (const k of Object.keys(slots)) delete slots[Number(k)];
      cursor.index = 0;
      pendingEffects = [];
      cleanups.length = 0;
      state.storeNotifications = 0;
    },
  };
});

vi.mock("react", () => ({
  // 메모이제이션이 의미다 — subscribe 가 렌더마다 새로 만들어지면 매번 재구독한다.
  useCallback: (fn: unknown, deps: unknown[]) => {
    const i = rt.cursor.index++;
    const prev = rt.slots[i] as { fn: unknown; deps: unknown[] } | undefined;
    if (prev && prev.deps.length === deps.length && deps.every((d, j) => Object.is(d, prev.deps[j]))) {
      return prev.fn;
    }
    rt.slots[i] = { fn, deps };
    return fn;
  },
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    const i = rt.cursor.index++;
    const prev = rt.slots[i] as { subscribe: unknown; unsubscribe?: () => void } | undefined;
    const entry = prev ?? { subscribe: undefined, unsubscribe: undefined };
    if (entry.subscribe !== subscribe) {
      rt.queueEffect(() => {
        entry.unsubscribe?.();
        entry.unsubscribe = subscribe(() => {
          rt.state.storeNotifications += 1;
        });
        rt.addCleanup(() => entry.unsubscribe?.());
      });
      entry.subscribe = subscribe;
    }
    rt.slots[i] = entry;
    // 클라이언트 렌더: 첫 렌더부터 실제 저장소 값을 읽는다.
    return getSnapshot();
  },
}));

async function render(examId: string, opts: { commit?: boolean } = {}) {
  const { useIntegritySignalsPreference } = await import("@/hooks/useIntegritySignalsPreference");
  rt.beginRender();
  const result = useIntegritySignalsPreference(examId);
  if (opts.commit !== false) rt.commit();
  return result;
}

type StorageListener = (event: { key: string | null }) => void;

function installWindow(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const listeners = new Set<StorageListener>();
  const setItem = vi.fn((key: string, value: string) => void data.set(key, value));
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem },
    addEventListener: (_type: string, listener: StorageListener) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: StorageListener) => void listeners.delete(listener),
  });
  return {
    data,
    setItem,
    listeners,
    /** 다른 탭이 저장소를 바꾼 것처럼 이벤트를 쏜다. */
    otherTabWrites(key: string, value: string) {
      data.set(key, value);
      listeners.forEach((l) => l({ key }));
    },
  };
}

describe("useIntegritySignalsPreference", () => {
  beforeEach(() => rt.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("첫 렌더부터 저장된 꺼짐을 반영한다 (5분 안 재진입, 캐시된 데이터)", async () => {
    // react-query 캐시가 살아 있으면 페이지는 데이터를 첫 렌더에 이미 가지고 있다.
    // effect 가 도는 커밋 전에 켜짐이 한 번 그려지면 빨간 표시가 깜빡인다.
    installWindow({ "qon.grade.integrity.exam-1": "false" });
    const [show] = await render("exam-1", { commit: false });
    expect(show).toBe(false);
  });

  it("저장된 값이 없으면 켜짐이고 마운트만으로는 아무것도 쓰지 않는다", async () => {
    const { data, setItem } = installWindow();
    const [first] = await render("exam-1", { commit: false });
    expect(first).toBe(true);
    const [show] = await render("exam-1");
    expect(show).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("끄면 시험별 키에 즉시 저장하고 구독자에게 알려 다음 렌더에 반영된다", async () => {
    const { data } = installWindow();
    const [, setShow] = await render("exam-1");
    expect(rt.state.storeNotifications).toBe(0);

    setShow(false);

    expect(data.get("qon.grade.integrity.exam-1")).toBe("false");
    expect(rt.state.storeNotifications).toBe(1);
    const [show] = await render("exam-1");
    expect(show).toBe(false);
  });

  it("다시 켜면 true 로 저장된다", async () => {
    const { data } = installWindow({ "qon.grade.integrity.exam-1": "false" });
    const [, setShow] = await render("exam-1");
    setShow(true);
    expect(data.get("qon.grade.integrity.exam-1")).toBe("true");
    const [show] = await render("exam-1");
    expect(show).toBe(true);
  });

  it("다른 시험으로 바뀌면 그 시험의 값을 읽는다 (같은 시험의 다른 학생은 그대로)", async () => {
    installWindow({ "qon.grade.integrity.exam-1": "false" });
    expect((await render("exam-1"))[0]).toBe(false); // 같은 시험: 유지
    expect((await render("exam-2"))[0]).toBe(true); // 저장된 값이 없는 다른 시험
    expect((await render("exam-1"))[0]).toBe(false);
  });

  it("다른 탭에서 바꾸면(storage 이벤트) 알림을 받고 새 값을 읽는다", async () => {
    const win = installWindow();
    await render("exam-1");
    expect((await render("exam-1"))[0]).toBe(true);

    win.otherTabWrites("qon.grade.integrity.exam-1", "false");

    expect(rt.state.storeNotifications).toBe(1);
    expect((await render("exam-1"))[0]).toBe(false);
  });

  it("같은 시험으로 다시 렌더해도 재구독하지 않고, 언마운트하면 해제한다", async () => {
    const win = installWindow();
    await render("exam-1");
    await render("exam-1");
    await render("exam-1");
    expect(win.listeners.size).toBe(1);

    rt.unmount();
    expect(win.listeners.size).toBe(0);
  });

  it("localStorage 접근이 예외를 던져도 켜짐으로 폴백하고 토글은 이 탭에서 동작한다", async () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("SecurityError");
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const [first, setShow] = await render("exam-1");
    expect(first).toBe(true);

    expect(() => setShow(false)).not.toThrow();
    expect((await render("exam-1"))[0]).toBe(false);
  });

  it("window 가 없어도(서버 렌더) 예외 없이 켜짐이다", async () => {
    // Node 환경에는 window 가 없다. 스텁도 하지 않는다.
    const [show, setShow] = await render("exam-9");
    expect(show).toBe(true);
    expect(() => setShow(false)).not.toThrow();
  });
});
