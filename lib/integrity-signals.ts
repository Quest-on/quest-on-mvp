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
 * 로그 한 건의 종류.
 *
 * - 탭 전환: `pasted_text` 가 마커와 **정확히** 같다. 본문에 마커가 섞인 진짜
 *   붙여넣기는 탭 전환이 아니다.
 * - 내부 복사: `is_internal === true` (AI 답변을 복사해 붙인 것).
 * - 외부 붙여넣기: 내부가 아니고 `suspicious` 인 것 중 탭 전환이 아닌 것.
 */
export function classifyPasteLog(log: PasteLog): PasteLogKind {
  if (log.pasted_text === TAB_SWITCH_MARKER) return "tab_switch";
  if (log.is_internal === true) return "internal_copy";
  if (log.suspicious) return "external_paste";
  return "other";
}

export interface PartitionedPasteLogs {
  tabSwitch: PasteLog[];
  external: PasteLog[];
  internal: PasteLog[];
}

/** 종류별로 나눈다. 입력 순서를 보존하고 원본 배열은 바꾸지 않는다. */
export function partitionPasteLogs(logs: readonly PasteLog[]): PartitionedPasteLogs {
  const result: PartitionedPasteLogs = { tabSwitch: [], external: [], internal: [] };
  for (const log of logs) {
    switch (classifyPasteLog(log)) {
      case "tab_switch":
        result.tabSwitch.push(log);
        break;
      case "external_paste":
        result.external.push(log);
        break;
      case "internal_copy":
        result.internal.push(log);
        break;
    }
  }
  return result;
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

/** 설정을 저장한다. 저장소가 없거나 쓸 수 없으면(사생활 보호 모드, 용량 초과) 조용히 넘어간다. */
export function writeIntegrityPreference(
  storage: Pick<PreferenceStorage, "setItem"> | null,
  examId: string,
  show: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(integrityPreferenceKey(examId), show ? "true" : "false");
  } catch {
    // 설정이 이 탭에서만 유지될 뿐, 채점 화면은 계속 쓸 수 있다.
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
