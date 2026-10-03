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
import type { DataSourceDownload } from "@/lib/analysis-exec/container";
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
 * 교수 자료 객체 키의 모양: `instructor-<교수자 id>/<YYYY-MM-DD>_<uuid>.<확장자>`(`/api/upload`,
 * `/api/upload/signed-url`, `lib/material-object-key.ts`). 두 조각이고 각 조각은 영숫자와 `._-` 만 쓴다.
 * 둘째 조각은 점으로 시작하지 않는다(`.`, `..` 금지).
 */
const MATERIAL_OBJECT_KEY_RE = /^instructor-[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,255}$/;

/**
 * 교수 자료 URL 에서 `exam-materials` 버킷의 객체 경로를 꺼낸다. 우리 Supabase 프로젝트의 Storage 주소가
 * 아니거나, 다른 버킷이거나, 객체 키가 교수 자료 키 모양이 아니면 null.
 *
 * 디코드한 **뒤에** 키 모양을 검사한다. 인코딩된 `%2F..%2F` 는 디코드 전 검사를 통과하고, Storage 클라이언트가
 * 디코드된 키를 그대로 URL 에 이어 붙이면 `..` 가 풀려 다른 버킷(비공개 `analysis-outputs` 등)의 객체를 서비스
 * 롤로 읽게 된다. `exams.materials` 는 교수가 쓰는 임의 문자열이므로 믿지 않는다.
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
  let key: string;
  try {
    key = decodeURIComponent(rest.slice(prefix.length));
  } catch {
    return null;
  }
  return MATERIAL_OBJECT_KEY_RE.test(key) ? key : null;
}

/**
 * 공개 데이터 파일을 교수 자료 버킷에서 내려받는다. 키 모양이 아니거나 빈 파일이거나 상한을 넘으면 다시 해도 같은
 * 실패(permanent), Storage 응답 실패는 일시 실패다.
 */
export async function downloadDataSource(
  supabase: SupabaseClient,
  source: AnalysisDataSource
): Promise<DataSourceDownload> {
  const key = materialObjectPath(source.url, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!key) return { ok: false, permanent: true };
  try {
    const { data, error } = await supabase.storage.from(EXAM_MATERIALS_BUCKET).download(key);
    if (error || !data) return { ok: false, permanent: false };
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_DATA_FILE_BYTES) return { ok: false, permanent: true };
    return { ok: true, bytes };
  } catch {
    return { ok: false, permanent: false };
  }
}

/** 그림 업로드 하나를 기다리는 최대 시간. */
const FIGURE_UPLOAD_TIMEOUT_MS = 15_000;

/**
 * 그림을 비공개 버킷에 올리는 저장소. 실패하거나 시간이 다 되면 false(던지지 않는다).
 * `remainingMs` 를 주면 남은 시간과 15초 중 짧은 쪽까지만 기다린다. 남은 시간이 없으면 올리지 않는다.
 */
export function createFigureStore(
  supabase: SupabaseClient,
  onError?: (path: string, error: unknown) => void,
  remainingMs?: () => number
): FigureStore {
  return {
    async upload(path: string, bytes: Uint8Array, mime: AnalysisFigureMime): Promise<boolean> {
      const budget = Math.min(FIGURE_UPLOAD_TIMEOUT_MS, remainingMs ? remainingMs() : FIGURE_UPLOAD_TIMEOUT_MS);
      if (budget <= 0) {
        onError?.(path, new Error("figure upload skipped: finalize deadline passed"));
        return false;
      }
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeout = new Promise<{ error: Error }>((resolve) => {
          timer = setTimeout(() => resolve({ error: new Error(`figure upload timed out after ${budget}ms`) }), budget);
        });
        const upload = supabase.storage
          .from(ANALYSIS_OUTPUTS_BUCKET)
          .upload(path, Buffer.from(bytes), { contentType: mime, upsert: true, cacheControl: "3600" });
        const { error } = await Promise.race([upload, timeout]);
        if (error) {
          onError?.(path, error);
          return false;
        }
        return true;
      } catch (error) {
        onError?.(path, error);
        return false;
      } finally {
        if (timer) clearTimeout(timer);
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
