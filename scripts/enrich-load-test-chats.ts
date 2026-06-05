/**
 * 부하/대시보드 테스트용 더미 학생의 "채팅 + 케이스 답안" 채우기 스크립트
 *
 * seed-load-test-students.ts 로 만든 `loadtest-` 세션을 대상으로:
 *   1) 케이스(서술형) 문항에 대해 학생마다 서로 다른 3개의 AI 튜터 질문/답변(messages)을 생성
 *   2) 케이스 문항 답안(submissions)을 2~3줄짜리 랜덤 서술로 교체
 * 모든 내용은 조합형 풀에서 무작위 추출 + 셔플하여 학생마다 최대한 다르게 만든다.
 *
 * 학생 시험 채팅 role 컨벤션: 학생="user", 튜터="ai" (LiveMonitoringCard / grading.ts 기준)
 *
 * ⚠️  .env.local 의 클라우드 Supabase 에 직접 쓴다. loadtest- 태깅 세션만 대상.
 *     재실행 안전: 대상 세션의 해당 문항 messages 를 먼저 지우고 다시 넣는다.
 *
 * 사용법:
 *   npx tsx scripts/enrich-load-test-chats.ts LIX7BQ
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const TAG = "loadtest-";
const code = process.argv[2];
if (!code) {
  console.error("사용법: npx tsx scripts/enrich-load-test-chats.ts <CODE>");
  process.exit(1);
}

// --------------- 유틸 ---------------
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
/** 배열에서 중복 없이 n개 추출 */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  }
  return out;
}

// --------------- 채팅 Q&A 풀 (CareNow 온보딩 A/B 테스트 케이스 기반) ---------------
// 각 항목: 학생 질문(q) + 튜터의 소크라테스식 힌트(a) + 질문 유형(t)
type Turn = { q: string; a: string; t: string };
const TURN_POOL: Turn[] = [
  {
    q: "이 케이스에서 성공 지표를 '7일 내 온보딩 완료율'로 잡는 게 맞을까요, 아니면 '복용 알림 첫 상호작용률'이 더 나을까요?",
    a: "둘 중 무엇이 '온보딩이 진짜로 의도한 행동 변화'에 더 가까운지 생각해 보세요. 완료 자체와 실제 핵심 행동(약 복용 상호작용) 중 무엇이 제품 가치에 직결되나요?",
    t: "strategy",
  },
  {
    q: "첫 화면 이탈률은 B안이 더 좋은데 온보딩 완료율은 비슷하다는 게 이상해요. 이걸 어떻게 해석해야 하나요?",
    a: "앞단 이탈이 줄었는데 끝까지 완료가 안 늘었다면, 줄어든 단계가 '완료'에는 영향을 줘도 '지속'에는 약했을 수 있어요. 어느 구간에서 사람이 빠지는지 단계별로 쪼개 보면 어떨까요?",
    t: "concept",
  },
  {
    q: "표본 배정이 랜덤인데 '권한 설정 안 해본 사용자' 비율이 A/B가 다르다는 로그가 있어요. 이게 결과에 문제가 되나요?",
    a: "그건 표본 비율 불일치(SRM) 신호일 수 있어요. 무작위 배정이 깨졌다면 지표 차이가 처치 효과인지 구성 차이인지 구분이 안 됩니다. 먼저 무엇을 점검해야 할까요?",
    t: "concept",
  },
  {
    q: "저사양 기기에서 권한 수락률 변동이 크다는데, 이걸 전체 평균에 그냥 합쳐서 결론 내도 되나요?",
    a: "평균이 세그먼트별 반대 경향을 가릴 수 있어요(심슨의 역설). 기기 등급으로 나눠 보면 방향이 유지되는지 확인해 보는 게 좋겠죠?",
    t: "strategy",
  },
  {
    q: "단기 지표만으로 B안을 채택하면 위험하다는 제품팀 우려가 이해가 안 돼요. 구체적으로 뭐가 문제죠?",
    a: "초기에 좋아 보이는 효과가 노벨티(신규성) 효과일 수 있어요. 시간이 지나도 유지되는지 보려면 최소 추적 구간이 왜 필요할지 생각해 보세요.",
    t: "concept",
  },
  {
    q: "가드레일 지표라는 걸 들어봤는데, 이 케이스에선 무엇을 가드레일로 둬야 할까요?",
    a: "핵심 지표를 올리면서 절대 나빠지면 안 되는 값이 뭘까요? 예를 들어 장기 잔존이나 핵심 이벤트 상호작용이 후보가 될 수 있어요.",
    t: "strategy",
  },
  {
    q: "권한 요청 타이밍이 이탈이랑 관련 있다고 메모에 적혀 있는데, 이게 지표 선택에 어떤 영향을 주나요?",
    a: "이탈이 UI 개선 때문인지 권한 팝업 타이밍 때문인지 섞여 있을 수 있어요. 원인을 분리하려면 어떤 추가 분석이 필요할까요?",
    t: "concept",
  },
  {
    q: "결국 오늘 회의에서 B안 채택/보류를 정해야 하는데, 어떤 기준이 충족되면 채택해도 된다고 말할 수 있을까요?",
    a: "핵심 지표 개선 + 가드레일 미악화 + 세그먼트 일관성 + 표본 건전성(SRM) 정도가 동시에 만족되는지를 기준선으로 잡아 보면 어때요?",
    t: "strategy",
  },
  {
    q: "표본 크기나 통계적 유의성은 이 정도 관측 메모로 충분히 판단할 수 있나요?",
    a: "효과 크기와 변동성, 그리고 세그먼트로 쪼갰을 때 각 칸의 표본이 충분한지가 관건이에요. 어디서 표본이 모자랄 것 같나요?",
    t: "concept",
  },
  {
    q: "복용 알림 첫 상호작용을 핵심 지표로 쓰면 장기 추적 구간이 부족하다는데, 그럼 이 지표는 못 쓰는 건가요?",
    a: "못 쓰는 게 아니라 '관측 창'이 더 필요한 거예요. 최소 며칠을 봐야 이 지표가 안정화될지 가정해 보면 결정이 쉬워집니다.",
    t: "other",
  },
  {
    q: "세그먼트로 나눠서 보라고 하는데, 어떤 축으로 분해하는 게 이 케이스에서 가장 의미 있을까요?",
    a: "메모가 힌트예요. 기기 등급, 시간대, 권한 경험 유무처럼 변동을 만든 축으로 쪼개면 결론이 뒤집히는지 볼 수 있죠.",
    t: "strategy",
  },
  {
    q: "되돌리기 어렵다는 개발팀과 장기 가치를 걱정하는 제품팀 사이에서, 리서처로서 어떤 식으로 절충안을 제시할 수 있을까요?",
    a: "전면 채택/전면 보류 외에 '조건부 단계적 롤아웃 + 장기 지표 모니터링' 같은 중간 선택지를 지표 기준과 함께 제안할 수 있어요.",
    t: "strategy",
  },
  {
    q: "온보딩 완료율을 성공 지표로 고정하면 어떤 함정이 있을 수 있나요?",
    a: "완료는 했지만 실제 약 복용 행동으로 이어지지 않는 '허무한 완료'가 늘 수 있어요. 완료 뒤 핵심 행동까지 연결되는지 함께 봐야겠죠?",
    t: "concept",
  },
  {
    q: "시간대에 따라 이탈률이 크게 달라진다는데, 이건 어떻게 통제하거나 보정하나요?",
    a: "시간대가 처치와 섞이지 않았는지 먼저 보고, 필요하면 시간대를 공변량으로 보정하거나 세그먼트로 나눠 비교하면 됩니다.",
    t: "concept",
  },
];

// --------------- 서술 답안 조합 풀 (2~3문장) ---------------
// A: 핵심 지표 + 근거 / B: 단일 지표 오판 가능성 / C: 추가 확인 제안
const ANS_A = [
  "핵심 성공 지표로는 '7일 내 온보딩 완료율'보다 '복용 알림 첫 상호작용률'을 두겠다. 단계 축소가 결국 약 복용 습관 형성이라는 본질적 가치로 이어졌는지를 더 잘 반영하기 때문이다.",
  "성패는 '온보딩 완료(7일 내)'를 1차 지표로, '복용 알림 첫 상호작용'을 동반 지표로 보고 판단하겠다. 완료만으로는 실제 행동 전환을 보장하지 못해서다.",
  "나는 첫 화면 이탈률 대신 '핵심 이벤트(복용 알림 첫 상호작용) 도달률'을 핵심 지표로 삼겠다. 온보딩의 목적이 진입이 아니라 핵심 습관 시작이기 때문이다.",
  "성공 지표는 '권한 수락률'이 아니라 '7일 내 핵심 행동까지 도달한 비율'로 고정하겠다. 권한은 수단일 뿐 UX 품질의 최종 신호가 아니다.",
  "단계 수를 줄인 의도를 감안해, '온보딩 완료율 × 복용 알림 첫 상호작용'을 함께 핵심 지표로 보겠다. 둘이 같이 올라야 진짜 개선이라 본다.",
  "1차 지표로 '복용 알림 첫 상호작용률'을 고정하겠다. 이탈률 개선은 보조 신호이며, 온보딩이 노린 행동 변화에 가장 가까운 지표라고 판단했다.",
  "성공의 정의를 '진입 이탈 감소'가 아니라 '7일 내 핵심 행동 정착'으로 잡겠다. 이쪽이 온보딩 UX 품질을 더 충실히 대변한다.",
];
const ANS_B = [
  "다만 첫 화면 이탈률만 보면 권한 요청 타이밍과 저사양 기기 변동 때문에 개선이 과대평가될 수 있다.",
  "그러나 단일 지표로 결론 내면, A/B 간 '권한 미경험 사용자' 비율 차이(표본 불일치)가 처치 효과를 오염시킬 위험이 있다.",
  "단, 평균 지표 하나로는 저사양/고사양 세그먼트에서 방향이 반대일 가능성(심슨의 역설)을 놓칠 수 있다.",
  "하지만 초기 개선이 노벨티 효과일 수 있어, 단기 지표만으로는 장기 가치를 오판할 소지가 크다.",
  "그렇지만 이탈률 개선과 온보딩 완료율의 불일치가 관측된 만큼, 한 지표만 믿으면 잘못된 채택으로 이어질 수 있다.",
  "다만 시간대·기기에 따른 변동이 커서, 보정 없이 전체 평균만 보면 효과를 잘못 읽을 위험이 있다.",
];
const ANS_C = [
  "그래서 기기 등급·시간대 세그먼트 분해와 권한 미경험 비율(SRM) 점검을 선행하고, 최소 7~14일 장기 추적을 가드레일로 둔 뒤 B안 채택을 판단하겠다.",
  "따라서 SRM 검증으로 표본 건전성을 먼저 확인하고, 기기/시간대별 분해 결과가 일관될 때에 한해 조건부 단계적 롤아웃을 제안한다.",
  "이에 권한 타이밍 효과를 분리하는 분해 분석과, 핵심 이벤트를 가드레일로 한 최소 추적 구간 확보 후에 결론을 내리겠다.",
  "그러므로 세그먼트별 결과 일관성·가드레일 미악화·표본 건전성이 동시에 충족될 때만 B안을 채택하고, 아니면 보류 후 추가 관측을 권한다.",
  "결론적으로 시간대를 공변량으로 보정하고 기기 세그먼트로 나눠 본 뒤, 장기 잔존 지표가 나빠지지 않음을 확인하고 채택 여부를 정하겠다.",
  "따라서 단기 채택 대신 장기 추적 최소 요건을 정의하고, 세그먼트 분해로 오판 위험을 걷어낸 다음 의사결정을 내리는 것을 제안한다.",
];

function buildAnswer(): string {
  return [pick(ANS_A), pick(ANS_B), pick(ANS_C)].join(" ");
}

// --------------- Supabase ---------------
function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락 (.env.local)");
    process.exit(1);
  }
  console.log(`→ 대상 Supabase: ${url.replace(/https:\/\/([a-z0-9]+).*/, "$1")} (클라우드)`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface Q {
  idx: number;
  type: string;
}
function findCaseIdx(questions: unknown): number {
  if (!Array.isArray(questions)) return -1;
  const norm: Q[] = questions.map((q: Record<string, unknown>, i: number) => ({
    idx: typeof q.idx === "number" ? q.idx : i,
    type: typeof q.type === "string" ? q.type : "essay",
  }));
  const caseQ = norm.find((q) => q.type === "essay" || q.type === "case" || q.type === "short-answer");
  return caseQ ? caseQ.idx : -1;
}

async function main() {
  const supabase = getSupabase();

  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("id, title, questions")
    .eq("code", code)
    .single();
  if (examErr || !exam) {
    console.error(`시험 "${code}" 조회 실패:`, examErr?.message);
    process.exit(1);
  }

  const caseIdx = findCaseIdx(exam.questions);
  if (caseIdx < 0) {
    console.error("케이스/서술형 문항을 찾지 못했습니다.");
    process.exit(1);
  }
  console.log(`시험: "${exam.title}" (${code}) | 케이스 문항 q_idx=${caseIdx}`);

  const { data: sessions, error: sessErr } = await supabase
    .from("sessions")
    .select("id, started_at, submitted_at, created_at")
    .eq("exam_id", exam.id)
    .like("student_id", `${TAG}%`);
  if (sessErr) {
    console.error("세션 조회 실패:", sessErr.message);
    process.exit(1);
  }
  const targets = sessions ?? [];
  console.log(`대상 더미 세션: ${targets.length}개\n`);
  if (targets.length === 0) {
    console.log("대상이 없습니다. 먼저 seed-load-test-students.ts 를 실행하세요.");
    return;
  }

  // 재실행 안전: 대상 세션의 케이스 문항 기존 messages 제거
  const targetIds = targets.map((s: { id: string }) => s.id);
  for (let i = 0; i < targetIds.length; i += 200) {
    const slice = targetIds.slice(i, i + 200);
    const { error } = await supabase
      .from("messages")
      .delete()
      .in("session_id", slice)
      .eq("q_idx", caseIdx);
    if (error) console.warn("기존 messages 삭제 경고:", error.message);
  }

  const allMessages: Record<string, unknown>[] = [];
  let answerUpdates = 0;

  for (const s of targets as Array<{ id: string; started_at: string | null; submitted_at: string | null; created_at: string }>) {
    // 채팅 타임스탬프 창: started_at ~ submitted_at (없으면 created_at 기준 추정)
    const start = new Date(s.started_at ?? s.created_at).getTime();
    const end = new Date(s.submitted_at ?? s.created_at).getTime();
    const span = Math.max(end - start, 6 * 60_000); // 최소 6분 확보
    const usableStart = start + Math.floor(span * 0.15);
    const usableSpan = Math.floor(span * 0.7);

    const turns = sample(TURN_POOL, 3); // 학생마다 서로 다른 3개 질문
    turns.forEach((turn, i) => {
      const userTime = usableStart + Math.floor((usableSpan / 3) * i) + randInt(0, 20_000);
      const aiTime = userTime + randInt(20_000, 70_000);
      allMessages.push({
        session_id: s.id,
        q_idx: caseIdx,
        role: "user",
        content: turn.q,
        message_type: turn.t,
        created_at: new Date(userTime).toISOString(),
      });
      allMessages.push({
        session_id: s.id,
        q_idx: caseIdx,
        role: "ai",
        content: turn.a,
        message_type: null,
        tokens_used: randInt(120, 420),
        created_at: new Date(aiTime).toISOString(),
      });
    });

    // 케이스 답안 교체 (2~3문장)
    const { error: upErr } = await supabase
      .from("submissions")
      .update({ answer: buildAnswer(), updated_at: new Date(end).toISOString() })
      .eq("session_id", s.id)
      .eq("q_idx", caseIdx);
    if (upErr) console.warn(`답안 업데이트 경고 (${s.id}):`, upErr.message);
    else answerUpdates++;
  }

  // messages 배치 insert
  for (let i = 0; i < allMessages.length; i += 1000) {
    const slice = allMessages.slice(i, i + 1000);
    const { error } = await supabase.from("messages").insert(slice);
    if (error) throw new Error(`messages insert 실패 (offset ${i}): ${error.message}`);
  }

  console.log(`✅ 완료`);
  console.log(`   채팅 메시지: ${allMessages.length}건 (${targets.length}명 × 3턴 × 2)`);
  console.log(`   케이스 답안 교체: ${answerUpdates}건`);
}

main().catch((e) => {
  console.error("❌ 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
