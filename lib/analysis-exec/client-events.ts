/**
 * `/api/chat/analysis` 가 브라우저에 보내는 SSE 이벤트 (이슈 #545)
 *
 * 서버와 클라이언트가 같은 모양을 쓴다. 이 모듈은 브라우저에서도 import 하므로 Node 전용 모듈을 쓰지 않는다.
 *
 * 이벤트 이름(`event:`)과 데이터(`data:` JSON)
 *   - status  { phase: "preparing" }                분석 환경을 준비한다(컨테이너 조회, 처음이면 생성과 파일 연결)
 *   - status  { phase: "restarting" }               환경이 만료되어 새로 만들고 이전 단계를 다시 실행한다
 *   - status  { phase: "running", cell: n }         코드 실행 중(n 번째)
 *   - status  { phase: "writing" }                  답변을 쓰는 중
 *   - text    { delta }                             답변 글자(최종 글은 done 의 content 로 바뀐다)
 *   - done    { message }                           정상 완료. 저장된 AI 메시지
 *   - error   { code, message? }                    실패. 실행한 셀이 있으면 저장된 메시지가 함께 온다
 *
 * JSON 오류 응답(스트림 전, HTTP 상태 코드)
 *   - 409 ANALYSIS_UNAVAILABLE { details: { reason } }: 이 문항은 분석 실행 대상이 아니다. 클라이언트는 같은 메시지를
 *     `/api/chat` 으로 보낸다(도구 없는 경로). 아무것도 저장하지 않은 상태에서만 이 응답이 나온다.
 */

import type { ClientAnalysisTurn } from "@/lib/analysis-exec/metadata";

export type AnalysisStatusPhase = "preparing" | "restarting" | "running" | "writing";

export type AnalysisErrorCode =
  /** 잔액 소진. 재시도하지 않는다. 학생에게 감독자를 부르라고 알린다. */
  | "quota_exhausted"
  /** 셀 수(12) 또는 시간(240초) 상한으로 중단했다. */
  | "limit_exceeded"
  /** 일반 429 를 재시도해도 풀리지 않았다. */
  | "rate_limited"
  /** 분석 환경(컨테이너, 파일)을 준비하지 못했다. */
  | "tool_unavailable"
  /** 그 밖의 실패. */
  | "failed";

export type AnalysisUnavailableReason = "not_analysis_partner" | "no_data_files" | "temp_session";

export type AnalysisSavedMessage = {
  content: string;
  timestamp: string;
  analysis: ClientAnalysisTurn;
};

export type AnalysisStreamEvent =
  | { event: "status"; data: { phase: AnalysisStatusPhase; cell?: number } }
  | { event: "text"; data: { delta: string } }
  | { event: "done"; data: { message: AnalysisSavedMessage } }
  | { event: "error"; data: { code: AnalysisErrorCode; message?: AnalysisSavedMessage } };

export const ANALYSIS_UNAVAILABLE_ERROR = "ANALYSIS_UNAVAILABLE";

/** 받은 SSE 이벤트를 모양 확인 뒤 돌려준다. 모르는 이벤트나 깨진 JSON 은 null. */
export function parseAnalysisStreamEvent(event: string | null, data: string): AnalysisStreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  switch (event) {
    case "status":
      if (p.phase === "preparing" || p.phase === "restarting" || p.phase === "running" || p.phase === "writing") {
        return {
          event: "status",
          data: { phase: p.phase, ...(typeof p.cell === "number" ? { cell: p.cell } : {}) },
        };
      }
      return null;
    case "text":
      return typeof p.delta === "string" ? { event: "text", data: { delta: p.delta } } : null;
    case "done":
      return isSavedMessage(p.message) ? { event: "done", data: { message: p.message } } : null;
    case "error": {
      const code = p.code;
      if (
        code !== "quota_exhausted" &&
        code !== "limit_exceeded" &&
        code !== "rate_limited" &&
        code !== "tool_unavailable" &&
        code !== "failed"
      ) {
        return null;
      }
      return { event: "error", data: { code, ...(isSavedMessage(p.message) ? { message: p.message } : {}) } };
    }
    default:
      return null;
  }
}

function isSavedMessage(value: unknown): value is AnalysisSavedMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const analysis = v.analysis as Record<string, unknown> | undefined;
  return (
    typeof v.content === "string" &&
    typeof v.timestamp === "string" &&
    typeof analysis === "object" &&
    analysis !== null &&
    typeof analysis.messageId === "string" &&
    Array.isArray(analysis.cells)
  );
}
