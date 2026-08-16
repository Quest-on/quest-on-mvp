import { test, expect } from "@playwright/test";
import { assertLocalTestEnv } from "../helpers/assert-local-test-env";
import { getTestSupabase } from "../helpers/supabase-test-client";

/**
 * 동시 start — 승자만 핀/큐잉 (이슈 #118, AC-21)
 *
 * 경쟁은 `/bulk-grade/start` 의 조건부 UPDATE 에서 산다. status 필터에 걸린 행
 * 하나만 갱신되고, 그 승자만 핀과 attempt id 를 얻어 큐에 넣는다.
 * 둘 다 통과하면 같은 시험 학생들이 서로 다른 설정으로 채점되고, 그건 성적
 * 이의제기에서 방어할 수 없다.
 *
 * 라우트 전체를 태우려면 교수 인증·제출된 학생 세션·캘리브레이션 상태까지
 * 갖춰야 한다. 여기서는 경쟁이 실제로 존재하는 지점(같은 필터의 동시 UPDATE)을
 * 두 요청으로 직접 친다. 핀 필드가 그 UPDATE 안에 함께 들어간다는 것은
 * `__tests__/ai-callsite-tracking.test.ts` 가 소스 수준에서 강제한다.
 */

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  assertLocalTestEnv();
});

const supabase = getTestSupabase();

const OWNER = "e2e-ai-config-race";
const START_FILTER_STATUSES = ["draft", "grading_done", "grading_failed"];

let raceSessionId: string | null = null;
let versionId: string | null = null;

test.beforeAll(async () => {
  const { data: label } = await supabase
    .from("ai_config_labels")
    .select("version_id")
    .eq("label", "production")
    .single();
  versionId = (label?.version_id as string) ?? null;

  const code = "RACE" + Date.now().toString(36).toUpperCase().slice(-6);
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .insert({
      title: "e2e-race",
      code,
      duration: 60,
      status: "draft",
      questions: [],
      instructor_id: OWNER,
    })
    .select("id")
    .single();
  expect(examError).toBeNull();

  const { data: session, error: sessionError } = await supabase
    .from("exam_grading_sessions")
    .insert({ exam_id: exam?.id, instructor_id: OWNER, status: "draft" })
    .select("id")
    .single();
  expect(sessionError).toBeNull();
  raceSessionId = (session?.id as string) ?? null;
});

test.afterAll(async () => {
  if (raceSessionId) {
    await supabase.from("exam_grading_sessions").delete().eq("id", raceSessionId);
  }
  await supabase.from("exams").delete().eq("instructor_id", OWNER);
});

const SNAPSHOT = {
  bulk_grading_worker: { model: "gpt-5.6-luna", timeoutMs: 120000, maxRetries: 2 },
};

test("픽스처가 실제로 만들어졌다", async () => {
  expect(raceSessionId).toBeTruthy();
  expect(versionId).toBeTruthy();
});

test("동시에 두 번 start 해도 한 쪽만 핀을 얻는다", async () => {
  const attempt = () =>
    supabase
      .from("exam_grading_sessions")
      .update({
        status: "grading",
        ai_config_version_id: versionId,
        ai_profile_snapshot: SNAPSHOT,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raceSessionId as string)
      .in("status", START_FILTER_STATUSES)
      .select("id");

  const [a, b] = await Promise.all([attempt(), attempt()]);
  const winners = [a, b].filter((r) => (r.data?.length ?? 0) > 0);

  // 정확히 하나. 둘 다 이기면 같은 시험이 두 설정으로 갈린다.
  expect(winners).toHaveLength(1);

  const { data: row } = await supabase
    .from("exam_grading_sessions")
    .select("status, ai_config_version_id, ai_profile_snapshot")
    .eq("id", raceSessionId as string)
    .single();

  // 승자의 핀은 같은 UPDATE 안에서 함께 박혀야 한다(반쪽 핀이면 DB 제약이 막는다).
  expect(row?.status).toBe("grading");
  expect(row?.ai_config_version_id).toBe(versionId);
  expect(row?.ai_profile_snapshot).toMatchObject(SNAPSHOT);
});

test("이미 grading 인 런은 다시 start 되지 않는다", async () => {
  const { data } = await supabase
    .from("exam_grading_sessions")
    .update({ status: "grading" })
    .eq("id", raceSessionId as string)
    .in("status", START_FILTER_STATUSES)
    .select("id");

  // 앞 테스트가 grading 으로 바꿔 놨으므로 필터에 아무 행도 안 걸려야 한다.
  expect(data ?? []).toHaveLength(0);
});

test("핀이 걸린 뒤에도 반쪽 상태로는 되돌릴 수 없다", async () => {
  // 재시작 로직이 버전만 지우면 워커가 스냅샷을 믿고 잘못된 설정으로 돈다.
  const { error } = await supabase
    .from("exam_grading_sessions")
    .update({ ai_config_version_id: null })
    .eq("id", raceSessionId as string);

  expect(error).not.toBeNull();
});
