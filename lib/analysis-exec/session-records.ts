/**
 * 분석 턴 기록의 DB, Storage 입출력 (이슈 #545)
 *
 * 새 테이블 없이 `messages.metadata.analysis` 와 Storage 두 버킷만 쓴다.
 *   - 읽기: 세션의 AI 메시지 중 분석 기록이 있는 것(시간 순서).
 *   - 권한: 본인 세션의 학생, 또는 그 시험을 만든 교수만. 그 밖은 막는다.
 *   - 공개 데이터 파일 읽기: 교수 자료 버킷(`exam-materials`)에서 URL 의 객체 경로로 내려받는다. 다른 호스트나
 *     버킷의 URL 은 받지 않는다(서버가 임의 주소를 가져오지 않게).
 *   - 그림 쓰기: 비공개 버킷 `analysis-outputs`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisDataSource } from "@/lib/analysis-exec/eligibility";
import { MAX_DATA_FILE_BYTES } from "@/lib/analysis-exec/limits";
import {
  ANALYSIS_OUTPUTS_BUCKET,
  readStoredAnalysisTurn,
  type AnalysisFigureMime,
  type StoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import type { FigureStore } from "@/lib/analysis-exec/persist";

/** 교수 자료 버킷. `app/api/upload/route.ts` 가 올리는 곳이다. */
export const EXAM_MATERIALS_BUCKET = "exam-materials";

export type SessionAnalysisRecord = {
  messageId: string;
  qIdx: number;
  createdAt: string;
  turn: StoredAnalysisTurn;
};

/** 세션의 분석 턴 기록을 시간 순서로 읽는다. 조회가 실패하면 던진다(호출부가 정한다). */
export async function loadSessionAnalysisRecords(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SessionAnalysisRecord[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, q_idx, created_at, metadata")
    .eq("session_id", sessionId)
    .eq("role", "ai")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const records: SessionAnalysisRecord[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const turn = readStoredAnalysisTurn(row.metadata);
    if (!turn || typeof row.id !== "string") continue;
    records.push({
      messageId: row.id,
      qIdx: typeof row.q_idx === "number" ? row.q_idx : 0,
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      turn,
    });
  }
  return records;
}

export type SessionAnalysisAccess =
  | { ok: true; viewer: "student" | "instructor"; session: { id: string; exam_id: string | null; student_id: string } }
  | { ok: false; status: 403 | 404 };

/**
 * 이 세션의 분석 기록을 볼 수 있는가. 본인 세션의 학생이거나, 교수 역할이면서 그 세션 시험의 `instructor_id` 가
 * 본인이어야 한다. 다른 학생과 다른 교수는 403 이다. 세션이 없으면 404.
 */
export async function resolveSessionAnalysisAccess(
  supabase: SupabaseClient,
  params: { sessionId: string; user: { id: string; role?: string | null } }
): Promise<SessionAnalysisAccess> {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, exam_id, student_id")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (error || !session) return { ok: false, status: 404 };

  const row = session as { id: string; exam_id: string | null; student_id: string };
  if (row.student_id === params.user.id) return { ok: true, viewer: "student", session: row };

  if (params.user.role === "instructor" && row.exam_id) {
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id")
      .eq("id", row.exam_id)
      .maybeSingle();
    if (!examError && exam && (exam as { instructor_id?: unknown }).instructor_id === params.user.id) {
      return { ok: true, viewer: "instructor", session: row };
    }
  }
  return { ok: false, status: 403 };
}

/**
 * 교수 자료 URL 에서 `exam-materials` 버킷의 객체 경로를 꺼낸다. 우리 Supabase 프로젝트의 Storage 주소가
 * 아니거나 다른 버킷이면 null.
 */
export function materialObjectPath(url: string, supabaseUrl: string | undefined): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (supabaseUrl) {
    try {
      if (new URL(supabaseUrl).host !== parsed.host) return null;
    } catch {
      return null;
    }
  }
  const marker = `/storage/v1/object/`;
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;
  // /storage/v1/object/public/<bucket>/<key> 또는 /storage/v1/object/<bucket>/<key>
  const rest = parsed.pathname.slice(at + marker.length).replace(/^(?:public|sign|authenticated)\//, "");
  const prefix = `${EXAM_MATERIALS_BUCKET}/`;
  if (!rest.startsWith(prefix)) return null;
  const key = rest.slice(prefix.length);
  if (!key || key.split("/").some((part) => part === ".." || part === "")) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

/** 공개 데이터 파일을 교수 자료 버킷에서 내려받는다. 못 읽거나 상한을 넘으면 null. */
export async function downloadDataSource(
  supabase: SupabaseClient,
  source: AnalysisDataSource
): Promise<Uint8Array | null> {
  const key = materialObjectPath(source.url, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!key) return null;
  const { data, error } = await supabase.storage.from(EXAM_MATERIALS_BUCKET).download(key);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DATA_FILE_BYTES) return null;
  return bytes;
}

/** 그림을 비공개 버킷에 올리는 저장소. 실패하면 false(던지지 않는다). */
export function createFigureStore(
  supabase: SupabaseClient,
  onError?: (path: string, error: unknown) => void
): FigureStore {
  return {
    async upload(path: string, bytes: Uint8Array, mime: AnalysisFigureMime): Promise<boolean> {
      try {
        const { error } = await supabase.storage
          .from(ANALYSIS_OUTPUTS_BUCKET)
          .upload(path, Buffer.from(bytes), { contentType: mime, upsert: true, cacheControl: "3600" });
        if (error) {
          onError?.(path, error);
          return false;
        }
        return true;
      } catch (error) {
        onError?.(path, error);
        return false;
      }
    },
  };
}

/** 그림 서명 URL(짧게). 실패하면 null. */
export async function signFigureUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSec: number
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(ANALYSIS_OUTPUTS_BUCKET).createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
