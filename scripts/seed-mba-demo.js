/**
 * MBA 데모 시험 생성 스크립트
 * Quest-On의 핵심 기능을 보여주기 위한 전략경영 케이스 스터디
 *
 * 실행: node scripts/seed-mba-demo.js
 */

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = "https://fmhpwotcfshoqpdhzqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtaHB3b3RjZnNob3FwZGh6cXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA0NTYyNSwiZXhwIjoyMDcwNjIxNjI1fQ.58NWRZsv3lmBFWuVS5QMS5cdI4CyOsamV8M2kc4ozqU";

const INSTRUCTOR_ID = "user_34j9rTrDlpHagh2DyGey7oH8Mrn"; // 유영준 instructor account

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function uuid() {
  return crypto.randomUUID();
}

function examCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (byte) =>
    alphabet[byte % alphabet.length]
  ).join("");
}

// ============================================================
// 케이스 자료 (RAG용 materials_text)
// ============================================================

const CASE_MATERIALS_TEXT = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
경영전략 케이스 스터디
"NexonHealth: 디지털 헬스케어 플랫폼의 글로벌 확장 전략"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1. 회사 개요]

NexonHealth(넥슨헬스)는 2020년 서울에서 설립된 디지털 헬스케어 스타트업이다.
AI 기반 건강관리 플랫폼을 운영하며, 한국 시장에서 빠르게 성장하고 있다.

• 설립: 2020년 3월 (서울)
• 직원 수: 280명 (2025년 12월 기준)
• 핵심 제품: "WellSync" — AI 건강 모니터링 및 개인화 헬스케어 플랫폼
• 한국 가입자: 320만 명 (MAU 180만)
• 2025년 매출: 480억 원 (전년 대비 67% 성장)
• 누적 투자: 시리즈 C까지 총 1,200억 원

CEO 박지현은 삼성전자 출신 엔지니어로, "모든 사람이 AI 주치의를 가질 수 있어야 한다"는
비전으로 회사를 설립했다. CTO 김태영은 구글 헬스 출신이며,
CMO 이수진은 네이버 마케팅 부문 출신이다.

[2. 제품 및 기술]

WellSync 플랫폼의 핵심 기능:
• AI 건강 분석: 웨어러블 데이터(심박수, 수면, 활동량)를 AI가 실시간 분석
• 개인화 건강 가이드: 사용자 프로파일 기반 맞춤 건강 조언
• 원격 진료 연계: 제휴 의료기관과의 실시간 원격 상담
• 만성질환 관리: 당뇨, 고혈압 등 만성질환자 대상 모니터링 서비스
• 기업 건강관리(B2B): 기업 임직원 건강관리 솔루션 "WellSync Enterprise"

기술 역량:
• 자체 개발 AI 엔진 "HealthMind" — 500만 건 이상의 건강 데이터 학습
• 국내 3대 대형병원(삼성서울, 서울아산, 세브란스)과 데이터 파트너십
• FDA 510(k) 인증 진행 중 (2026년 Q2 예상 승인)
• ISO 27001, HIPAA 준비 완료

[3. 재무 데이터]

(단위: 억 원)
                    2023년    2024년    2025년
매출액               142       288       480
  - B2C (개인)        98       178       264
  - B2B (기업)        44       110       216
매출원가              85       158       235
매출총이익            57       130       245
영업비용             134       228       340
  - R&D              52        88       130
  - 마케팅            48        78       110
  - 인건비            24        42        68
  - 기타              10        20        32
영업이익            -77       -98       -95
당기순이익          -82      -105      -102

EBITDA              -62       -75       -65
현금 보유액          320       280       450 (시리즈 C 유입)
월 현금소진율(Burn)   12        15        18

[4. 시장 환경]

글로벌 디지털 헬스케어 시장:
• 2025년 시장 규모: 약 3,500억 달러
• 연평균 성장률(CAGR): 18.2% (2025-2030 예측)
• 아시아태평양 지역: 가장 빠른 성장 (CAGR 22.5%)

한국 시장:
• 2025년 국내 디지털 헬스케어 시장: 약 4.5조 원
• 경쟁자: 삼성헬스(삼성전자), 카카오헬스케어, 네이버헬스케어
• NexonHealth 시장점유율: 약 8% (B2C 기준)
• 정부 규제: 2026년 디지털 치료제 급여화 예상

주요 경쟁사 비교:
                    NexonHealth    삼성헬스    카카오헬스    네이버헬스
MAU (만명)            180           1,200       450          380
B2B 고객 수           85개사        200개사     120개사       90개사
AI 정확도             94.2%         91.8%      89.5%        90.1%
원격진료 연계          O             X          O            △
만성질환 관리          O             △          X            O
글로벌 진출           미진출        진출       미진출        미진출

[5. 글로벌 확장 검토 — 세 가지 시장 옵션]

NexonHealth 경영진은 2026년 하반기 글로벌 확장을 검토 중이다.
내부적으로 세 가지 시장이 후보로 논의되고 있다:

■ 옵션 A: 일본 시장 진출
• 시장 규모: 아시아 최대 (약 800억 달러)
• 고령화율 29.3% (세계 1위) — 만성질환 관리 수요 극대
• 규제: 의료기기 인증(PMDA) 필요, 평균 18-24개월
• 문화적 유사성 높음, 한류 긍정적 영향
• 진입 장벽: SoftBank 투자 기업 등 로컬 강자 다수
• 예상 진입 비용: 150-200억 원
• 잠재 파트너: Sony Healthcare, Omron Health

■ 옵션 B: 동남아시아(인도네시아 + 베트남) 시장
• 합산 인구 3.7억, 중산층 급성장
• 디지털 헬스케어 침투율 낮음 (5% 미만) — 블루오션
• 규제 환경 비교적 느슨
• 인프라 부족 (인터넷 보급률, 의료 접근성)
• 현지 경쟁자 약함 — 시장 선점 기회
• 예상 진입 비용: 80-120억 원
• 잠재 파트너: Gojek (인도네시아), VinGroup (베트남)

■ 옵션 C: 미국 시장 진출
• 세계 최대 디지털 헬스케어 시장 (약 1,500억 달러)
• FDA 인증 진행 중 (2026 Q2 예상 완료)
• 경쟁 극심: Apple Health, Teladoc, Livongo 등
• 시장 진입 시 글로벌 신뢰도 및 브랜드 가치 극대화
• 의료보험 시스템 복잡 (Medicare, Medicaid, 민간보험)
• 예상 진입 비용: 500-800억 원
• 잠재 파트너: CVS Health, UnitedHealth Group

[6. 전략적 고려사항]

CEO 박지현의 발언:
"우리는 현금이 2년 정도 더 버틸 수 있지만, 다음 시리즈 D 라운드를 위해서는
글로벌 시장에서의 의미 있는 트랙션이 필수적입니다. 투자자들은 한국 시장만으로는
유니콘 밸류에이션을 지지하지 않을 것입니다."

CFO 정민호의 의견:
"현재 월 18억 원의 현금 소진 속도를 고려하면, 글로벌 확장에 투입할 수 있는
예산은 최대 200-250억 원입니다. 그 이상은 런웨이를 위험 수준으로 줄입니다.
시리즈 D는 2027년 Q1 전에 마감해야 합니다."

CTO 김태영의 기술 관점:
"HealthMind AI 엔진의 현지화에는 시장당 최소 6개월의 데이터 수집과
모델 리트레이닝이 필요합니다. 동시에 2개 시장에 진출하면 R&D 팀이 분산되어
AI 정확도가 떨어질 리스크가 있습니다."

이사회의 압력:
시리즈 C 리드 투자자인 소프트뱅크벤처스는 "2027년까지 ARR 1,000억 원 달성"을
요구하고 있다. 현재 ARR은 약 520억 원이며, 한국 시장만으로는 연간 30-40%
성장이 한계로 전망된다. 글로벌 매출 없이 ARR 1,000억을 달성하기는 어렵다.

[7. 추가 데이터]

진입 방식별 비교:
                    직접 진출    합작투자(JV)    인수합병(M&A)
초기 투자            중간         낮음            높음
시장 진입 속도        느림         중간            빠름
통제력               높음         중간            높음
리스크               높음         중간            매우 높음
문화적 적응           어려움       쉬움            중간
파트너 의존도         없음         높음            낮음

각 시장의 규제 타임라인:
• 일본 (PMDA): 18-24개월
• 인도네시아 (BPOM): 6-12개월
• 베트남 (MOH): 8-14개월
• 미국 (FDA): 12-18개월 (이미 6개월 진행)

NexonHealth 직원 역량:
• 일본어 가능 인력: 12명
• 영어 가능 인력: 45명
• 인도네시아/베트남어 가능: 3명
• 해외 사업 경험 보유 임원: CEO, CMO (각각 미국, 일본 경험)
`.trim();

// ============================================================
// 시험 문제
// ============================================================

const questions = [
  {
    id: "q-0",
    idx: 0,
    type: "essay",
    text: `<h2>문제 1. 시장 분석 및 진출 시장 선택 (25점)</h2>
<p>NexonHealth가 검토 중인 세 가지 글로벌 시장 옵션(일본, 동남아시아, 미국)을 <strong>전략적 관점</strong>에서 비교 분석하시오.</p>
<p>분석 시 다음 요소를 반드시 포함하시오:</p>
<ul>
<li>각 시장의 매력도 (시장 규모, 성장성, 경쟁 강도)</li>
<li>NexonHealth의 역량과 각 시장의 적합성 (자원 기반 관점)</li>
<li>리스크 요인 (규제, 문화, 재무)</li>
</ul>
<p>분석을 바탕으로 <strong>NexonHealth가 우선 진출해야 할 시장 1곳</strong>을 선택하고, 그 이유를 논리적으로 설명하시오.</p>
<blockquote>💡 <strong>AI 튜터를 활용하여</strong> 전략 프레임워크(Porter's 5 Forces, CAGE Distance 등)의 적용 방법이나 시장 데이터 해석에 대해 질문할 수 있습니다.</blockquote>`,
    ai_context: `이 문제는 시장 분석 능력을 평가합니다. 학생이 Porter's 5 Forces, CAGE Distance Framework, PESTEL 분석 등의 프레임워크 적용법을 물으면 친절하게 안내해주세요. 단, 직접적으로 "일본이 최적이다" 같은 결론은 제시하지 마세요. 프레임워크를 어떻게 적용하는지, 어떤 데이터를 봐야 하는지를 가이드해주세요. 케이스에 제공된 재무 데이터와 시장 데이터를 활용한 분석을 장려하세요.`,
  },
  {
    id: "q-1",
    idx: 1,
    type: "essay",
    text: `<h2>문제 2. 진입 전략 수립 (25점)</h2>
<p>문제 1에서 선택한 시장에 대한 <strong>구체적인 진입 전략</strong>을 수립하시오.</p>
<p>다음 항목을 포함하여 작성하시오:</p>
<ol>
<li><strong>진입 방식</strong>: 직접 진출, 합작투자(JV), 인수합병(M&A) 중 선택하고 근거 제시</li>
<li><strong>목표 고객 세그먼트</strong>: B2C/B2B 비중 및 우선 타겟 고객층</li>
<li><strong>가치 제안(Value Proposition)</strong>: 현지 시장에서의 차별화 포인트</li>
<li><strong>파트너십 전략</strong>: 잠재 파트너와의 협력 구조</li>
<li><strong>타임라인</strong>: 12개월 단위의 마일스톤</li>
</ol>
<blockquote>💡 진입 방식의 장단점이나 현지화 전략에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>`,
    ai_context: `이 문제는 전략 수립 능력을 평가합니다. 학생이 진입 방식(직접진출 vs JV vs M&A)의 비교를 물으면 케이스 자료의 비교표를 참고하여 설명하되, 어떤 방식이 최적인지 직접 답하지는 마세요. 학생이 스스로 분석하도록 유도하세요. CFO의 재무 제약(200-250억원 예산)과 CTO의 기술 제약(시장당 6개월 현지화)을 고려한 전략을 묻는 경우, 이 제약조건의 의미를 해석하는 방법을 안내해주세요.`,
  },
  {
    id: "q-2",
    idx: 2,
    type: "essay",
    text: `<h2>문제 3. 재무 분석 및 투자 타당성 (25점)</h2>
<p>NexonHealth의 <strong>재무 상황</strong>을 분석하고, 글로벌 확장의 <strong>투자 타당성</strong>을 평가하시오.</p>
<p>다음을 반드시 포함하시오:</p>
<ol>
<li><strong>현재 재무 건전성 분석</strong>: 수익성, 현금흐름, 런웨이 분석</li>
<li><strong>글로벌 확장 소요 비용 추정</strong>: 선택한 시장의 예상 투자 비용과 회수 기간</li>
<li><strong>시리즈 D 라운드 달성 조건 분석</strong>: ARR 1,000억 원 달성을 위한 시나리오</li>
<li><strong>리스크-수익 트레이드오프</strong>: 확장하지 않을 때의 리스크 vs 확장의 리스크</li>
</ol>
<blockquote>💡 재무 비율 계산법이나 벨류에이션 프레임워크에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>`,
    ai_context: `이 문제는 재무 분석 능력을 평가합니다. 학생이 런웨이 계산법, Burn Rate 분석, ARR 성장 모델링 등을 물으면 계산 방법을 안내해주세요. 케이스의 재무 데이터(매출, EBITDA, 현금 보유액, 월 현금소진율)를 활용한 분석을 권장하세요. "현금 450억, 월 소진 18억이면 런웨이는?" 같은 질문에는 계산 방법을 알려주되 직접 답을 제시하지 마세요. 학생이 직접 계산하도록 유도하세요.`,
  },
  {
    id: "q-3",
    idx: 3,
    type: "essay",
    text: `<h2>문제 4. 전략적 리더십과 의사결정 (25점)</h2>
<p>당신이 NexonHealth의 <strong>이사회 멤버</strong>라고 가정하십시오.</p>
<p>CEO 박지현이 제안한 글로벌 확장 계획에 대해 다음을 작성하시오:</p>
<ol>
<li><strong>비판적 평가</strong>: 현재 글로벌 확장 계획의 가장 큰 약점 또는 간과된 리스크 2가지를 지적하시오</li>
<li><strong>대안 제시</strong>: 글로벌 확장 외에 NexonHealth가 고려할 수 있는 성장 전략 대안은 무엇인가?</li>
<li><strong>최종 의사결정</strong>: 이사회 멤버로서 "글로벌 확장 진행" 또는 "확장 연기"를 선택하고, 당신의 결정을 옹호하는 설득력 있는 논거를 제시하시오</li>
</ol>
<p><em>※ 이 문제에는 정답이 없습니다. 논리의 일관성과 설득력을 평가합니다.</em></p>
<blockquote>💡 전략적 의사결정 프레임워크나 리스크 평가 방법에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>`,
    ai_context: `이 문제는 비판적 사고력과 전략적 의사결정 능력을 평가합니다. 학생이 의사결정 프레임워크(Decision Matrix, Real Options Theory, Scenario Planning 등)를 물으면 설명해주세요. 그러나 "확장해야 한다/하지 말아야 한다"는 결론은 절대 제시하지 마세요. 이 문제의 핵심은 학생의 독자적인 판단과 논거의 질입니다. 학생이 자신의 주장을 발전시킬 수 있도록 "어떤 반론이 가능할까요?" "그 논거를 뒷받침할 데이터는 무엇일까요?" 같은 소크라테스식 질문으로 사고를 확장시켜주세요.`,
  },
];

// ============================================================
// 루브릭
// ============================================================

const rubric = [
  {
    evaluationArea: "분석적 사고력 (Analytical Thinking)",
    detailedCriteria:
      "주어진 데이터와 정보를 체계적으로 분석하고, 핵심 인사이트를 도출하는 능력. 단순한 나열이 아닌, 데이터 간의 관계와 패턴을 파악하여 의미 있는 결론을 이끌어내는가를 평가합니다. 재무 데이터, 시장 데이터를 실제 분석에 활용했는지가 중요합니다.",
  },
  {
    evaluationArea: "전략 프레임워크 적용 (Framework Application)",
    detailedCriteria:
      "경영전략 이론과 프레임워크(Porter's 5 Forces, CAGE, PESTEL, BCG Matrix, Ansoff Matrix 등)를 적절히 활용하여 분석을 체계화하는 능력. 프레임워크를 기계적으로 적용하는 것이 아니라, 상황에 맞게 선택하고 유연하게 활용하는지를 평가합니다.",
  },
  {
    evaluationArea: "논리적 일관성 및 설득력 (Logic & Persuasion)",
    detailedCriteria:
      "주장-근거-결론의 논리적 흐름이 일관되고 설득력 있는가. 각 문제에서의 분석이 서로 연결되어 통합적인 전략 제안으로 이어지는지, 반론을 예상하고 이에 대한 대응 논리를 갖추었는지를 평가합니다.",
  },
  {
    evaluationArea: "실행 가능성 (Feasibility)",
    detailedCriteria:
      "제안한 전략이 NexonHealth의 현실적 제약조건(재무, 인력, 기술, 시간)을 고려한 실행 가능한 계획인가. 비용, 타임라인, 필요 자원 등을 구체적으로 제시하고, 잠재적 장애물에 대한 대응 방안을 포함하는지를 평가합니다.",
  },
  {
    evaluationArea: "창의성 및 전략적 통찰 (Creativity & Insight)",
    detailedCriteria:
      "교과서적 답변을 넘어서 독창적인 관점이나 인사이트를 제시하는가. 다른 학생들이 놓칠 수 있는 기회나 리스크를 발견하거나, 기존 프레임워크를 창의적으로 조합하여 차별화된 전략을 도출하는 능력을 평가합니다.",
  },
];

// ============================================================
// 시험 생성
// ============================================================

async function createMBADemoExam() {
  const examId = uuid();
  const code = examCode();
  const now = new Date().toISOString();

  const examData = {
    id: examId,
    title: "경영전략: 디지털 헬스케어 스타트업의 글로벌 확장 전략",
    code,
    description:
      "NexonHealth 케이스 스터디를 통해 글로벌 시장 분석, 진입 전략 수립, 재무 타당성 평가, 전략적 의사결정 역량을 종합적으로 평가합니다.",
    duration: 90,
    questions: JSON.stringify(questions),
    status: "draft",
    instructor_id: INSTRUCTOR_ID,
    student_count: 0,
    created_at: now,
    updated_at: now,
    materials: JSON.stringify([]),
    materials_text: JSON.stringify([
      {
        url: "case-materials",
        text: CASE_MATERIALS_TEXT,
        fileName: "NexonHealth_케이스자료.pdf",
      },
    ]),
    rubric: JSON.stringify(rubric),
    rubric_public: true,
    chat_weight: 25,
    type: "exam",
    rag_status: "none",
    allow_draft_in_waiting: true,
    allow_chat_in_waiting: false,
    canvas_config: JSON.stringify({}),
    initial_state: JSON.stringify({}),
  };

  console.log("📝 시험 생성 중...");
  console.log(`   제목: ${examData.title}`);
  console.log(`   코드: ${code}`);
  console.log(`   시간: ${examData.duration}분`);
  console.log(`   문제 수: ${questions.length}문`);
  console.log(`   채팅 가중치: ${examData.chat_weight}%`);
  console.log(`   루브릭 공개: ${examData.rubric_public}`);
  console.log("");

  // 1. Insert exam
  const { error: examError } = await supabase.from("exams").insert(examData);
  if (examError) {
    console.error("❌ 시험 생성 실패:", examError.message);
    return;
  }
  console.log("✅ 시험 레코드 생성 완료");

  // 2. Insert exam_node (so it appears in instructor's drive UI)
  const { error: nodeError } = await supabase.from("exam_nodes").insert({
    id: uuid(),
    instructor_id: INSTRUCTOR_ID,
    parent_id: null,
    kind: "exam",
    name: examData.title,
    exam_id: examId,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });
  if (nodeError) {
    console.warn("⚠️  exam_node 생성 실패 (비치명적):", nodeError.message);
  } else {
    console.log("✅ 대시보드 노드 생성 완료");
  }

  // 3. Trigger RAG processing
  console.log("\n🔄 RAG 처리 트리거 중...");
  try {
    const { error: ragUpdateError } = await supabase
      .from("exams")
      .update({ rag_status: "pending" })
      .eq("id", examId);

    if (ragUpdateError) {
      console.warn("⚠️  RAG 상태 업데이트 실패:", ragUpdateError.message);
    }

    // Note: RAG processing needs to be triggered via the internal API
    // This would normally happen through the app server
    console.log(
      "ℹ️  RAG 처리는 앱 서버를 통해 트리거해야 합니다."
    );
    console.log(
      '   시험을 웹에서 열고 "편집" 후 저장하면 자동으로 RAG가 처리됩니다.'
    );
  } catch (e) {
    console.warn("⚠️  RAG 트리거 실패 (수동 트리거 필요)");
  }

  console.log("\n" + "═".repeat(60));
  console.log("🎓 MBA 데모 시험 생성 완료!");
  console.log("═".repeat(60));
  console.log(`\n  시험 코드: ${code}`);
  console.log(`  시험 ID:   ${examId}`);
  console.log(`\n  📌 다음 단계:`);
  console.log(
    `  1. Quest-On 웹사이트에서 인스트럭터 대시보드 접속`
  );
  console.log(
    `  2. "${examData.title}" 시험 확인`
  );
  console.log(
    `  3. 시험을 한번 편집 → 저장하여 RAG 처리 트리거`
  );
  console.log(
    `  4. 학생 계정으로 코드 "${code}" 입력하여 응시 테스트`
  );
  console.log("\n  🎯 영업 시 강조 포인트:");
  console.log(
    "  • AI 튜터가 케이스 자료를 기반으로 답변 (RAG)"
  );
  console.log(
    "  • 학생의 AI 활용 과정이 성적의 25%에 반영"
  );
  console.log(
    "  • 루브릭 기반 자동 채점으로 교수 시간 절약"
  );
  console.log(
    "  • 학생-AI 상호작용 로그로 학습 과정 추적 가능"
  );
  console.log("");
}

createMBADemoExam().catch(console.error);
