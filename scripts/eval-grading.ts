/**
 * 채점 모델 평가 하네스.
 *
 * 교수가 직접 매긴 점수(grades.grade_type='manual')를 정답으로 두고,
 * 모델·reasoning 조합별 채점 정확도를 잰다.
 *
 * 왜 골든셋을 저장소에 커밋하지 않는가:
 *   평가 항목은 실제 학생 답안이다. 신원은 익명화돼도 답안 본문은 학생이 쓴 글이고,
 *   git 은 한 번 들어가면 영구 보존이다. 그래서 데이터는 커밋하지 않고
 *   실행 시점에 스테이징 DB 에서 뽑는다. 재현성은 --seed 로 확보한다.
 *
 * 사용법:
 *   NEXT_PUBLIC_SUPABASE_URL=<스테이징> SUPABASE_SERVICE_ROLE_KEY=<키> OPENAI_API_KEY=<키> \
 *     npx run eval:grading -- --n 24 --models "gpt-5.6-luna:none,gpt-5.6-terra"
 *
 * 안전장치:
 *   - Supabase URL 이 프로덕션 ref 를 가리키면 즉시 중단한다. 읽기 전용이지만
 *     운영 DB 에 평가 부하를 걸지 않는다. docs/CODEX_DB_SAFETY.md 참조.
 */
import { createClient } from "@supabase/supabase-js";

const PROD_REFS = ["fmhpwotcfshoqpdhzqqj"];

interface GoldItem {
  prof_score: number;
  question: string;
  answer: string;
}

interface Outcome {
  score: number | null;
  ms: number;
  milliUsd: number;
  reasoning: number;
}

/** OpenAI 공식 요금 (1M 토큰 단가). lib/ai-pricing.ts 와 같은 출처. */
const PRICES: Record<string, { i: number; o: number }> = {
  "gpt-5.6-sol": { i: 5, o: 30 },
  "gpt-5.6-terra": { i: 2, o: 12 },
  "gpt-5.6-luna": { i: 0.2, o: 1.2 },
  "gpt-5.4": { i: 2.5, o: 15 },
  "gpt-5.3-chat-latest": { i: 1.75, o: 14 },
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

async function loadGolden(n: number, seed: string): Promise<GoldItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요하다 (스테이징)");
  }
  for (const ref of PROD_REFS) {
    if (url.includes(ref)) {
      throw new Error(`중단: Supabase URL 이 프로덕션(${ref})을 가리킨다. 스테이징으로 실행하라.`);
    }
  }

  const supabase = createClient(url, key);
  // 교수가 직접 매긴 채점만 정답으로 쓴다. auto/ai_summary 는 모델이 매긴 값이라 정답이 될 수 없다.
  const { data: grades, error } = await supabase
    .from("grades")
    .select("id, score, q_idx, session_id")
    .eq("grade_type", "manual")
    .not("score", "is", null)
    .limit(600);
  if (error) throw new Error(`grades 조회 실패: ${error.message}`);

  const items: GoldItem[] = [];
  // seed 로 순서를 고정해 재현 가능하게 만든다.
  const ordered = [...(grades ?? [])].sort((a, b) =>
    hash(a.id + seed) - hash(b.id + seed)
  );

  for (const g of ordered) {
    if (items.length >= n) break;
    const { data: sub } = await supabase
      .from("submissions")
      .select("answer")
      .eq("session_id", g.session_id)
      .eq("q_idx", g.q_idx)
      .maybeSingle();
    const answer = sub?.answer;
    if (!answer || answer.length < 150 || answer.length > 2000) continue;

    const { data: session } = await supabase
      .from("sessions").select("exam_id").eq("id", g.session_id).maybeSingle();
    if (!session) continue;
    const { data: exam } = await supabase
      .from("exams").select("questions").eq("id", session.exam_id).maybeSingle();
    const question = exam?.questions?.[g.q_idx]?.text;
    if (!question) continue;

    items.push({ prof_score: g.score, question, answer });
  }
  return items;
}

/** seed 기반 결정적 정렬용 해시. 같은 seed 면 같은 표본이 나온다. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const SYSTEM =
  "당신은 대학 서술형 답안을 채점하는 조교입니다. 채점 기준에 따라 0~100점으로 평가합니다.";

const userPrompt = (item: GoldItem) => `아래 문항과 학생 답안을 100점 만점으로 채점하세요.
내용의 정확성, 논리 전개, 근거 제시, 문항 요구사항 충족도를 종합적으로 봅니다.
반드시 첫 줄에 "점수: NN" 형식으로만 쓰고, 그 다음 줄에 한 문장으로 근거를 적으세요.

[문항]
${item.question.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1200)}

[학생 답안]
${item.answer.slice(0, 2000)}`;

async function gradeOne(
  model: string,
  effort: string | null,
  item: GoldItem
): Promise<Outcome | { err: string }> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(item) },
    ],
    max_completion_tokens: 700,
  };
  if (effort) body.reasoning_effort = effort;

  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { err: String(json?.error?.message ?? "").slice(0, 80) };

  const text: string = json.choices?.[0]?.message?.content ?? "";
  const usage = json.usage ?? {};
  const price = PRICES[model] ?? { i: 0, o: 0 };
  return {
    score: Number(text.match(/점수[:\s]*(\d{1,3})/)?.[1] ?? NaN) || null,
    ms: Date.now() - t0,
    milliUsd:
      (((usage.prompt_tokens ?? 0) * price.i + (usage.completion_tokens ?? 0) * price.o) / 1e6) *
      1000,
    reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** 피어슨 상관계수. 교수 점수와 모델 점수의 순위 일치도를 본다. */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

async function main() {
  const n = Number(arg("n", "24"));
  const seed = arg("seed", "quest-on");
  const spec = arg("models", "gpt-5.4,gpt-5.6-luna:none,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol");
  const configs = spec.split(",").map((s) => {
    const [model, effort] = s.trim().split(":");
    return { model, effort: effort ?? null };
  });

  const gold = await loadGolden(n, seed);
  if (gold.length === 0) throw new Error("골든셋이 비었다. 스테이징에 manual 채점 데이터가 있는지 확인하라.");
  console.log(`골든셋 ${gold.length}건 (seed=${seed})`);
  console.log(`교수 점수: ${gold.map((g) => g.prof_score).join(", ")}\n`);

  console.log(
    "설정".padEnd(26) + "MAE".padStart(7) + "편향".padStart(8) + "상관".padStart(8) +
    "지연".padStart(8) + "추론".padStart(8) + "비용(m$)".padStart(10)
  );

  for (const { model, effort } of configs) {
    const label = `${model}${effort ? `(${effort})` : ""}`;
    const results: Array<Outcome | { err: string }> = [];
    // 동시 8건. 레이트리밋을 밀지 않으면서 24건을 3~4 배치로 끝낸다.
    for (let i = 0; i < gold.length; i += 8) {
      results.push(
        ...(await Promise.all(gold.slice(i, i + 8).map((item) => gradeOne(model, effort, item))))
      );
    }

    const paired = results
      .map((r, i) => ({ r, prof: gold[i].prof_score }))
      .filter((x): x is { r: Outcome; prof: number } => !("err" in x.r) && typeof x.r.score === "number");

    if (paired.length === 0) {
      const firstErr = results.find((r) => "err" in r) as { err: string } | undefined;
      console.log(label.padEnd(26) + `  실패: ${firstErr?.err ?? "점수 파싱 불가"}`);
      continue;
    }

    const diffs = paired.map((x) => (x.r.score as number) - x.prof);
    const mae = diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length;
    const bias = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const corr = pearson(paired.map((x) => x.r.score as number), paired.map((x) => x.prof));
    const ms = paired.reduce((a, x) => a + x.r.ms, 0) / paired.length;
    const reasoning = paired.reduce((a, x) => a + x.r.reasoning, 0);
    const cost = paired.reduce((a, x) => a + x.r.milliUsd, 0);

    console.log(
      label.padEnd(26) +
        mae.toFixed(1).padStart(7) +
        `${bias >= 0 ? "+" : ""}${bias.toFixed(1)}`.padStart(8) +
        corr.toFixed(3).padStart(8) +
        `${(ms / 1000).toFixed(1)}s`.padStart(8) +
        String(reasoning).padStart(8) +
        cost.toFixed(1).padStart(10)
    );
  }

  console.log(
    "\nMAE=평균절대오차(낮을수록 좋음) · 편향=교수 대비 후함(+)/박함(-) · 상관=교수 점수와의 일치도(높을수록 좋음)"
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
