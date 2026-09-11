/**
 * Next.js 기동 훅 (이슈 #118)
 *
 * AI 추론 강도 환경변수를 기동 시점에 검증한다. 잘못된 값을 런타임 첫 채점까지
 * 숨겨 두면 교수가 채점을 누른 순간에야 터진다 — 배포 직후에 죽는 편이 낫다.
 *
 * 검증만 하고 값을 캐시하지 않는다. 실제 해석은 요청마다 resolver 가 다시 한다.
 */

export async function register(): Promise<void> {
  // Edge 런타임에는 process.env 전량이 없고 이 검증도 필요 없다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { AI_TASKS, GLOBAL_EFFORT_ENV_KEY, resolveAiTaskProfile, taskEffortEnvKey } =
    await import("@/lib/ai-task-profile");

  const declared = [
    GLOBAL_EFFORT_ENV_KEY,
    ...AI_TASKS.map((task) => taskEffortEnvKey(task)),
  ].filter((key) => {
    const raw = process.env[key];
    return typeof raw === "string" && raw.trim() !== "";
  });

  if (declared.length === 0) return;

  // 선언된 키가 있으면 모든 태스크를 실제로 해석해 본다.
  // 모델×effort 조합이 지원되지 않는 경우까지 여기서 걸린다.
  for (const task of AI_TASKS) {
    resolveAiTaskProfile({ task });
  }

  const { logInfo } = await import("@/lib/logger");
  await logInfo(
    `[ai-config] reasoning effort overrides validated at startup: ${declared.join(", ")}`,
    { path: "instrumentation.ts" }
  );
}
