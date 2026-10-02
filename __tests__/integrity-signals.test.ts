/**
 * 채점 화면 '의심 표시' 토글의 순수 로직 (이슈 #514).
 *
 * 탭 전환과 외부 붙여넣기는 서버에서 둘 다 `suspicious = !isInternal` 로 저장된다
 * (`app/api/log/paste/route.ts`). 그래서 DB 만 보면 탭 전환 행이 '0자 외부
 * 붙여넣기' 와 구분되지 않는다. 데이터는 지우지 않고 **표시 단계에서만** 종류를
 * 가른다. 이 파일은 그 판정과, 토글이 꺼졌을 때 하이라이트에 넘길 로그 선택,
 * 시험별 localStorage 저장을 고정한다.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TAB_SWITCH_MARKER,
  classifyPasteLog,
  countIntegritySignals,
  createIntegrityPreferenceStore,
  integrityPreferenceKey,
  logsForQuestion,
  partitionPasteLogs,
  readIntegrityPreference,
  selectLogsForHighlight,
  writeIntegrityPreference,
} from "@/lib/integrity-signals";
import { highlightPastedContent, type PasteLog } from "@/lib/highlight-paste";

function log(overrides: Partial<PasteLog> & { id: string }): PasteLog {
  return {
    question_id: "q1",
    length: 10,
    pasted_text: "",
    is_internal: false,
    suspicious: true,
    timestamp: "2026-10-06T01:00:00Z",
    created_at: "2026-10-06T01:00:00Z",
    ...overrides,
  };
}

// useExamGuards.ts 가 실제로 보내는 모양 그대로. 서버는 suspicious=true 로 저장한다.
const tabSwitch = (id: string) =>
  log({ id, length: 0, pasted_text: TAB_SWITCH_MARKER, paste_start: 0, paste_end: 0 });
const external = (id: string, text = "외부에서 가져온 문장입니다.") =>
  log({ id, length: text.length, pasted_text: text });
const internal = (id: string, text = "AI 답변에서 복사한 문장입니다.") =>
  log({ id, length: text.length, pasted_text: text, is_internal: true, suspicious: false });

describe("classifyPasteLog — 로그 종류 판정", () => {
  it("[TAB_SWITCH] 는 탭 전환이다 (suspicious=true 로 저장돼 있어도)", () => {
    expect(classifyPasteLog(tabSwitch("t1"))).toBe("tab_switch");
  });

  it("suspicious 이면서 탭 전환이 아닌 것은 외부 붙여넣기다", () => {
    expect(classifyPasteLog(external("e1"))).toBe("external_paste");
  });

  it("is_internal 이면 내부 복사다", () => {
    expect(classifyPasteLog(internal("i1"))).toBe("internal_copy");
  });

  it("내부도 의심도 아니면 other 다", () => {
    expect(classifyPasteLog(log({ id: "o1", suspicious: false }))).toBe("other");
  });

  it("본문에 마커가 들어 있어도 정확히 일치하지 않으면 외부 붙여넣기다", () => {
    const pasted = log({ id: "e2", pasted_text: `앞 ${TAB_SWITCH_MARKER} 뒤`, length: 12 });
    expect(classifyPasteLog(pasted)).toBe("external_paste");
  });

  it("pasted_text 가 없는 의심 로그는 외부 붙여넣기로 남는다 (현행 동작 보존)", () => {
    const noText = log({ id: "e3" });
    delete (noText as { pasted_text?: string }).pasted_text;
    expect(classifyPasteLog(noText)).toBe("external_paste");
  });

  it("is_internal 이 true 면 본문이 마커와 같아도 내부 복사다 (내부 검사가 먼저)", () => {
    // 학생 쪽 탭 전환 기록은 항상 isInternal=false 로 가므로 실제로는 안 생기는 조합이다.
    // 그래도 내부 복사 표시가 있으면 탭 전환으로 분류돼 채점 정보(내부 복사)가 사라지면 안 된다.
    const odd = log({
      id: "i2",
      length: 0,
      pasted_text: TAB_SWITCH_MARKER,
      is_internal: true,
      suspicious: false,
    });
    expect(classifyPasteLog(odd)).toBe("internal_copy");
    // suspicious 가 true 로 남아 있어도 같다.
    expect(classifyPasteLog({ ...odd, suspicious: true })).toBe("internal_copy");
  });
});

describe("partitionPasteLogs — 종류별 분리", () => {
  it("탭 전환 행이 외부 붙여넣기 건수에 합산되지 않는다", () => {
    const logs = [
      external("e1"),
      tabSwitch("t1"),
      tabSwitch("t2"),
      tabSwitch("t3"),
      internal("i1"),
    ];
    const { tabSwitch: tabs, external: ext, internal: int } = partitionPasteLogs(logs);
    expect(tabs.map((l) => l.id)).toEqual(["t1", "t2", "t3"]);
    expect(ext.map((l) => l.id)).toEqual(["e1"]);
    expect(int.map((l) => l.id)).toEqual(["i1"]);
  });

  it("입력 순서를 보존하고 원본 배열을 바꾸지 않는다", () => {
    const logs = [tabSwitch("t1"), external("e1"), tabSwitch("t2")];
    const snapshot = [...logs];
    const { tabSwitch: tabs } = partitionPasteLogs(logs);
    expect(tabs.map((l) => l.id)).toEqual(["t1", "t2"]);
    expect(logs).toEqual(snapshot);
  });

  it("signals 는 탭 전환과 외부 붙여넣기를 입력 순서대로 담는다 (내부 복사 제외)", () => {
    const logs = [tabSwitch("t1"), internal("i1"), external("e1"), tabSwitch("t2")];
    expect(partitionPasteLogs(logs).signals.map((l) => l.id)).toEqual(["t1", "e1", "t2"]);
  });

  it("is_internal 이 true 인 마커 행은 탭 전환이 아니라 내부 복사로 묶인다", () => {
    const odd = log({
      id: "i2",
      length: 0,
      pasted_text: TAB_SWITCH_MARKER,
      is_internal: true,
      suspicious: false,
    });
    const parts = partitionPasteLogs([odd]);
    expect(parts.internal.map((l) => l.id)).toEqual(["i2"]);
    expect(parts.tabSwitch).toEqual([]);
    expect(parts.signals).toEqual([]);
  });

  it("빈 입력이면 모두 빈 배열이다", () => {
    expect(partitionPasteLogs([])).toEqual({
      tabSwitch: [],
      external: [],
      internal: [],
      signals: [],
    });
  });
});

describe("logsForQuestion / countIntegritySignals — 숨기는 기록 수", () => {
  const q1 = [external("e1"), tabSwitch("t1"), tabSwitch("t2"), internal("i1")];
  const q2 = [log({ id: "e9", question_id: "q2", pasted_text: "다른 문항" })];

  it("문항에 속한 로그만 고른다 (FinalAnswerCard 와 같은 기준)", () => {
    expect(logsForQuestion([...q1, ...q2], "q1").map((l) => l.id)).toEqual([
      "e1",
      "t1",
      "t2",
      "i1",
    ]);
    // questionId 가 없으면 전부, 로그가 없으면 빈 배열.
    expect(logsForQuestion([...q1, ...q2], undefined)).toHaveLength(5);
    expect(logsForQuestion(undefined, "q1")).toEqual([]);
  });

  it("탭 전환과 외부 붙여넣기만 센다 (내부 복사는 꺼도 보이므로 세지 않는다)", () => {
    expect(countIntegritySignals(q1, "q1")).toBe(3);
  });

  it("다른 문항의 기록은 세지 않는다", () => {
    expect(countIntegritySignals([...q1, ...q2], "q1")).toBe(3);
    expect(countIntegritySignals([...q1, ...q2], "q2")).toBe(1);
  });

  it("숨길 기록이 없으면 0 이다", () => {
    expect(countIntegritySignals([internal("i1")], "q1")).toBe(0);
    expect(countIntegritySignals([], "q1")).toBe(0);
    expect(countIntegritySignals(undefined, "q1")).toBe(0);
  });
});

describe("탭 전환 마커 — 학생 쪽 생산자와 같은 문자열", () => {
  it("hooks/useExamGuards.ts 가 보내는 pasted_text 가 TAB_SWITCH_MARKER 와 같다", () => {
    // 학생 쪽 파일은 이 이슈 범위 밖이라 수정하지 않고, 읽어서 비교한다.
    // 한쪽만 바뀌면 표시 단계가 탭 전환을 못 알아보고 '0자 외부 붙여넣기' 가 되살아난다.
    const source = readFileSync(resolve(__dirname, "..", "hooks", "useExamGuards.ts"), "utf8");
    const sent = [...source.matchAll(/pasted_text:\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(sent).toEqual([TAB_SWITCH_MARKER]);
  });
});

describe("selectLogsForHighlight — 토글 상태별 하이라이트 입력", () => {
  const logs = [external("e1"), tabSwitch("t1"), internal("i1")];

  it("켜짐: 외부와 내부 로그를 넘기고 탭 전환은 뺀다", () => {
    expect(selectLogsForHighlight(logs, true).map((l) => l.id)).toEqual(["e1", "i1"]);
  });

  it("꺼짐: 내부 복사만 넘긴다 (외부 로그를 highlightPastedContent 에 넘기지 않는다)", () => {
    expect(selectLogsForHighlight(logs, false).map((l) => l.id)).toEqual(["i1"]);
  });

  it("꺼짐: 내부 복사가 없으면 빈 배열이다", () => {
    expect(selectLogsForHighlight([external("e1"), tabSwitch("t1")], false)).toEqual([]);
  });

  it("highlightPastedContent 와 이어 보면 꺼짐에서 빨간색만 사라진다", () => {
    const answer = "외부에서 가져온 문장입니다. AI 답변에서 복사한 문장입니다. 직접 쓴 문장입니다.";

    const on = highlightPastedContent(answer, selectLogsForHighlight(logs, true));
    expect(on).toContain("bg-red-200");
    expect(on).toContain("bg-blue-200");

    const off = highlightPastedContent(answer, selectLogsForHighlight(logs, false));
    expect(off).not.toContain("bg-red-200");
    expect(off).not.toContain("bg-red-100");
    expect(off).toContain("bg-blue-200");
    // 본문은 그대로 남는다.
    expect(off).toContain("외부에서 가져온 문장입니다.");
  });

  it("답안에 마커 문자열이 있어도 탭 전환 로그가 본문을 칠하지 않는다", () => {
    const answer = `직접 쓴 글 ${TAB_SWITCH_MARKER} 끝`;
    const out = highlightPastedContent(answer, selectLogsForHighlight([tabSwitch("t1")], true));
    expect(out).not.toContain("<mark");
  });
});

/** localStorage 의 최소 흉내. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("의심 표시 설정 저장 (localStorage)", () => {
  it("키는 qon.grade.integrity.{examId} 다", () => {
    expect(integrityPreferenceKey("exam-1")).toBe("qon.grade.integrity.exam-1");
  });

  it("저장된 값이 없으면 켜짐이다 (현행 동작)", () => {
    expect(readIntegrityPreference(fakeStorage(), "exam-1")).toBe(true);
  });

  it("false 를 쓰면 같은 시험에서 꺼짐으로 읽힌다", () => {
    const storage = fakeStorage();
    writeIntegrityPreference(storage, "exam-1", false);
    expect(storage.data.get("qon.grade.integrity.exam-1")).toBe("false");
    expect(readIntegrityPreference(storage, "exam-1")).toBe(false);
  });

  it("다시 켜면 켜짐으로 읽힌다", () => {
    const storage = fakeStorage();
    writeIntegrityPreference(storage, "exam-1", false);
    writeIntegrityPreference(storage, "exam-1", true);
    expect(readIntegrityPreference(storage, "exam-1")).toBe(true);
  });

  it("시험별로 따로 저장된다", () => {
    const storage = fakeStorage();
    writeIntegrityPreference(storage, "exam-1", false);
    expect(readIntegrityPreference(storage, "exam-1")).toBe(false);
    expect(readIntegrityPreference(storage, "exam-2")).toBe(true);
  });

  it("알 수 없는 값은 켜짐으로 본다 (신호를 놓치는 쪽으로 틀리지 않는다)", () => {
    for (const raw of ["", "0", "off", "FALSE", "null", "{}"]) {
      const storage = fakeStorage({ "qon.grade.integrity.exam-1": raw });
      expect(readIntegrityPreference(storage, "exam-1"), raw).toBe(true);
    }
  });

  it("저장소를 못 쓰면(null) 켜짐이고 쓰기는 조용히 넘어간다", () => {
    expect(readIntegrityPreference(null, "exam-1")).toBe(true);
    expect(() => writeIntegrityPreference(null, "exam-1", false)).not.toThrow();
  });

  it("저장소가 예외를 던져도(사생활 보호 모드, 용량 초과) 화면은 깨지지 않는다", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readIntegrityPreference(broken, "exam-1")).toBe(true);
    expect(() => writeIntegrityPreference(broken, "exam-1", false)).not.toThrow();
  });

  it("쓰기는 저장됐는지를 돌려준다 (저장소가 없거나 던지면 false)", () => {
    expect(writeIntegrityPreference(fakeStorage(), "exam-1", false)).toBe(true);
    expect(writeIntegrityPreference(null, "exam-1", false)).toBe(false);
    const broken = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(writeIntegrityPreference(broken, "exam-1", false)).toBe(false);
  });
});

/** storage 이벤트를 받는 window 의 최소 흉내. */
function fakeEventTarget() {
  type Listener = (event: { key: string | null }) => void;
  const listeners = new Set<Listener>();
  return {
    listeners,
    addEventListener: (_type: "storage", listener: Listener) => void listeners.add(listener),
    removeEventListener: (_type: "storage", listener: Listener) => void listeners.delete(listener),
    emit: (key: string | null) => listeners.forEach((l) => l({ key })),
  };
}

describe("의심 표시 설정 스토어 (useSyncExternalStore 용)", () => {
  it("저장된 값이 없으면 켜짐이고, 저장된 꺼짐은 바로 읽힌다", () => {
    const storage = fakeStorage({ "qon.grade.integrity.exam-2": "false" });
    const store = createIntegrityPreferenceStore({
      getStorage: () => storage,
      getEventTarget: () => null,
    });
    expect(store.getSnapshot("exam-1")).toBe(true);
    expect(store.getSnapshot("exam-2")).toBe(false);
  });

  it("setPreference 는 저장하고 구독자에게 알린다", () => {
    const storage = fakeStorage();
    const store = createIntegrityPreferenceStore({
      getStorage: () => storage,
      getEventTarget: () => null,
    });
    const onChange = vi.fn();
    store.subscribe("exam-1", onChange);

    store.setPreference("exam-1", false);

    expect(storage.data.get("qon.grade.integrity.exam-1")).toBe("false");
    expect(store.getSnapshot("exam-1")).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("다른 탭의 변경(storage 이벤트)을 같은 키에 한해 알린다", () => {
    const target = fakeEventTarget();
    const store = createIntegrityPreferenceStore({
      getStorage: () => fakeStorage(),
      getEventTarget: () => target,
    });
    const onChange = vi.fn();
    store.subscribe("exam-1", onChange);

    target.emit("qon.grade.integrity.exam-2");
    expect(onChange).not.toHaveBeenCalled();

    target.emit("qon.grade.integrity.exam-1");
    expect(onChange).toHaveBeenCalledTimes(1);

    // localStorage.clear() 는 key 가 null 이다.
    target.emit(null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("구독 해제하면 이벤트 리스너와 알림이 모두 사라진다", () => {
    const target = fakeEventTarget();
    const store = createIntegrityPreferenceStore({
      getStorage: () => fakeStorage(),
      getEventTarget: () => target,
    });
    const onChange = vi.fn();
    const unsubscribe = store.subscribe("exam-1", onChange);
    expect(target.listeners.size).toBe(1);

    unsubscribe();
    expect(target.listeners.size).toBe(0);
    store.setPreference("exam-1", false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("저장소를 못 쓰면 이 탭 메모리로 토글이 계속 동작한다", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const store = createIntegrityPreferenceStore({
      getStorage: () => broken,
      getEventTarget: () => null,
    });
    expect(store.getSnapshot("exam-1")).toBe(true);
    expect(() => store.setPreference("exam-1", false)).not.toThrow();
    expect(store.getSnapshot("exam-1")).toBe(false);
    store.setPreference("exam-1", true);
    expect(store.getSnapshot("exam-1")).toBe(true);
  });

  it("저장소 자체가 없어도(null) 메모리로 동작하고 구독은 예외 없이 끝난다", () => {
    const store = createIntegrityPreferenceStore({
      getStorage: () => null,
      getEventTarget: () => null,
    });
    expect(store.getSnapshot("exam-1")).toBe(true);
    const unsubscribe = store.subscribe("exam-1", () => {});
    store.setPreference("exam-1", false);
    expect(store.getSnapshot("exam-1")).toBe(false);
    expect(() => unsubscribe()).not.toThrow();
  });

  it("메모리 값은 다른 탭이 같은 키를 바꾸면 저장소 값에 자리를 내준다", () => {
    const target = fakeEventTarget();
    let writable = false;
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!writable) throw new Error("QuotaExceededError");
        data.set(key, value);
      },
    };
    const store = createIntegrityPreferenceStore({
      getStorage: () => storage,
      getEventTarget: () => target,
    });
    store.subscribe("exam-1", () => {});

    store.setPreference("exam-1", false); // 쓰기 실패 → 메모리에만 꺼짐
    expect(store.getSnapshot("exam-1")).toBe(false);

    writable = true;
    data.set("qon.grade.integrity.exam-1", "true"); // 다른 탭이 켬
    target.emit("qon.grade.integrity.exam-1");
    expect(store.getSnapshot("exam-1")).toBe(true);
  });
});
