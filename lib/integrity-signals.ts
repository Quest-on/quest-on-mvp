/**
 * 채점 화면 '의심 표시'(탭 전환, 외부 붙여넣기) 토글의 순수 로직.
 *
 * 서버는 탭 전환도 외부 붙여넣기도 `suspicious = !isInternal` 로 저장한다
 * (`app/api/log/paste/route.ts`). 그래서 DB 만 보면 탭 전환 행이 '길이 0 짜리 외부
 * 붙여넣기'와 구분되지 않는다. 데이터는 지우지 않고(감사 기록) **표시 단계에서만**
 * 종류를 가른다.
 *
 * React/UI 의존성이 없어 단위 테스트가 가능하다.
 */
import type { PasteLog } from "@/lib/highlight-paste";

/**
 * 학생 쪽 탭 전환 기록이 `pasted_text` 에 싣는 마커.
 * 생산자는 `hooks/useExamGuards.ts` 의 visibilitychange 핸들러다. 거기서 값을 바꾸면
 * 이 상수도 같이 바꿔야 하고, 이미 저장된 행은 옛 값 그대로이므로 둘 다 인식해야 한다.
 */
export const TAB_SWITCH_MARKER = "[TAB_SWITCH]";

export type PasteLogKind = "tab_switch" | "external_paste" | "internal_copy" | "other";

/**
 * 로그 한 건의 종류. 검사 순서가 곧 우선순위다.
 *
 * - 내부 복사: `is_internal === true` (시험 화면 안에서 복사해 붙인 것 — AI 대화, 문제 본문,
 *   평가 기준, 학생 본인 답안. 표식은 `CopyProtector`, 채팅 메시지 복사 버튼(`CopyMessageButton`),
 *   답안 칸 copy·cut 핸들러가 붙인다).
 *   **가장 먼저** 본다. 내부 복사 표시가 있는 행을 다른 종류로 분류하면 채점 정보
 *   (시험 화면 안의 내용을 얼마나 가져다 썼는지)가 조용히 사라진다.
 * - 탭 전환: `pasted_text` 가 마커와 **정확히** 같다. 본문에 마커가 섞인 진짜
 *   붙여넣기는 탭 전환이 아니다.
 * - 외부 붙여넣기: 위 둘이 아니고 `suspicious` 인 것.
 */
export function classifyPasteLog(log: PasteLog): PasteLogKind {
  if (log.is_internal === true) return "internal_copy";
  if (log.pasted_text === TAB_SWITCH_MARKER) return "tab_switch";
  if (log.suspicious) return "external_paste";
  return "other";
}

export interface PartitionedPasteLogs {
  tabSwitch: PasteLog[];
  external: PasteLog[];
  internal: PasteLog[];
  /** 탭 전환과 외부 붙여넣기를 입력 순서대로. 둘 다 '의심 표시'가 켜졌을 때만 보이는 신호다. */
  signals: PasteLog[];
}

/** 종류별로 나눈다. 입력 순서를 보존하고 원본 배열은 바꾸지 않는다. */
export function partitionPasteLogs(logs: readonly PasteLog[]): PartitionedPasteLogs {
  const result: PartitionedPasteLogs = { tabSwitch: [], external: [], internal: [], signals: [] };
  for (const log of logs) {
    switch (classifyPasteLog(log)) {
      case "tab_switch":
        result.tabSwitch.push(log);
        result.signals.push(log);
        break;
      case "external_paste":
        result.external.push(log);
        result.signals.push(log);
        break;
      case "internal_copy":
        result.internal.push(log);
        break;
    }
  }
  return result;
}

/**
 * 한 문항에 속한 로그. `questionId` 가 없으면 전부.
 * `FinalAnswerCard` 와 채점 페이지가 같은 기준으로 세도록 한 곳에 둔다.
 */
export function logsForQuestion(
  logs: readonly PasteLog[] | undefined,
  questionId?: string,
): PasteLog[] {
  return (logs ?? []).filter((log) => !questionId || log.question_id === questionId);
}

/**
 * 의심 표시를 끄면 숨겨지는 기록 수(탭 전환 + 외부 붙여넣기).
 * 내부 복사는 꺼도 계속 보이므로 세지 않는다.
 */
export function countIntegritySignals(
  logs: readonly PasteLog[] | undefined,
  questionId?: string,
): number {
  return partitionPasteLogs(logsForQuestion(logs, questionId)).signals.length;
}

/**
 * `highlightPastedContent` 에 넘길 로그.
 *
 * 탭 전환 로그는 본문에 대응하는 텍스트가 없으므로 항상 뺀다(답안에 마커 문자열이
 * 우연히 있어도 칠하지 않는다). 의심 표시가 꺼져 있으면 외부 로그도 넘기지 않는다.
 * 내부 복사는 AI 답변을 얼마나 가져다 썼는지 보여 주는 채점 정보라 항상 넘긴다.
 */
export function selectLogsForHighlight(
  logs: readonly PasteLog[],
  showIntegritySignals: boolean,
): PasteLog[] {
  return logs.filter((log) => {
    const kind = classifyPasteLog(log);
    if (kind === "tab_switch") return false;
    if (kind === "internal_copy") return true;
    return showIntegritySignals;
  });
}

// ── 시험별 설정 저장 (localStorage) ──────────────────────────────────

/** 이 모양만 있으면 된다. `Storage` 전체를 요구하지 않아 테스트에서 흉내 내기 쉽다. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function integrityPreferenceKey(examId: string): string {
  return `qon.grade.integrity.${examId}`;
}

/**
 * 저장된 설정을 읽는다. 기본값은 켜짐(현행 동작).
 *
 * 정확히 "false" 일 때만 꺼짐이다. 값이 없거나 알 수 없거나 저장소를 못 읽으면 켜짐 —
 * 어떤 오류에서도 부정행위 신호를 조용히 숨기는 쪽으로 틀리지 않게 한다.
 */
export function readIntegrityPreference(
  storage: Pick<PreferenceStorage, "getItem"> | null,
  examId: string,
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(integrityPreferenceKey(examId)) !== "false";
  } catch {
    return true;
  }
}

/**
 * 설정을 저장한다. 저장소가 없거나 쓸 수 없으면(사생활 보호 모드, 용량 초과) 예외 없이
 * false 를 돌려준다. 호출부가 이 탭 메모리로 대신 들고 있을 수 있게 알려 주는 값이다.
 */
export function writeIntegrityPreference(
  storage: Pick<PreferenceStorage, "setItem"> | null,
  examId: string,
  show: boolean,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(integrityPreferenceKey(examId), show ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/**
 * 브라우저 localStorage. 서버 렌더이거나 접근이 막혀 있으면 null.
 * (일부 브라우저는 `window.localStorage` 를 읽는 것만으로 SecurityError 를 던진다.)
 */
export function getBrowserStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

// ── useSyncExternalStore 용 스토어 ───────────────────────────────────

/** `storage` 이벤트만 듣는 window 의 최소 모양. */
export interface StorageEventTarget {
  addEventListener(type: "storage", listener: (event: { key: string | null }) => void): void;
  removeEventListener(type: "storage", listener: (event: { key: string | null }) => void): void;
}

export interface IntegrityPreferenceStore {
  /** 현재 값. 렌더 중에 불리므로 동기이고 가볍다. */
  getSnapshot(examId: string): boolean;
  /** 저장하고 같은 탭의 구독자에게 알린다(`storage` 이벤트는 다른 탭에만 온다). */
  setPreference(examId: string, show: boolean): void;
  /** 같은 탭의 변경과 다른 탭의 `storage` 이벤트를 듣는다. 반환값은 해제 함수. */
  subscribe(examId: string, onChange: () => void): () => void;
}

export function createIntegrityPreferenceStore(deps: {
  getStorage: () => PreferenceStorage | null;
  getEventTarget: () => StorageEventTarget | null;
}): IntegrityPreferenceStore {
  const listeners = new Set<() => void>();
  // 저장소에 쓰지 못했을 때만 채우는 이 탭의 임시 값. 이게 없으면 저장소를 못 쓰는 환경에서
  // 스위치를 눌러도 값이 안 바뀐다(스냅샷을 저장소에서 읽기 때문).
  const memory = new Map<string, boolean>();

  return {
    getSnapshot(examId) {
      const remembered = memory.get(integrityPreferenceKey(examId));
      if (remembered !== undefined) return remembered;
      return readIntegrityPreference(deps.getStorage(), examId);
    },

    setPreference(examId, show) {
      const key = integrityPreferenceKey(examId);
      if (writeIntegrityPreference(deps.getStorage(), examId, show)) memory.delete(key);
      else memory.set(key, show);
      listeners.forEach((listener) => listener());
    },

    subscribe(examId, onChange) {
      const key = integrityPreferenceKey(examId);
      // 같은 함수가 두 번 구독돼도 각각 해제되도록 감싼다.
      const listener = () => onChange();
      listeners.add(listener);

      const target = deps.getEventTarget();
      const onStorage = (event: { key: string | null }) => {
        // key 가 null 이면 localStorage.clear() 다.
        if (event.key !== null && event.key !== key) return;
        // 다른 탭이 저장에 성공했다면 그 값이 이긴다.
        if (event.key === null) memory.clear();
        else memory.delete(key);
        onChange();
      };
      target?.addEventListener("storage", onStorage);

      return () => {
        listeners.delete(listener);
        target?.removeEventListener("storage", onStorage);
      };
    },
  };
}

function getBrowserEventTarget(): StorageEventTarget | null {
  return typeof window === "undefined" ? null : (window as unknown as StorageEventTarget);
}

/** 채점 화면이 쓰는 브라우저용 스토어(모듈 하나, 시험 id 별로 키가 갈린다). */
export const integrityPreferenceStore = createIntegrityPreferenceStore({
  getStorage: getBrowserStorage,
  getEventTarget: getBrowserEventTarget,
});
