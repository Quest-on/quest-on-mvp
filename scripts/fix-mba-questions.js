/**
 * MBA 데모 시험 문제 수정 — 케이스 자료를 문제 1에 직접 임베딩
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://fmhpwotcfshoqpdhzqqj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtaHB3b3RjZnNob3FwZGh6cXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA0NTYyNSwiZXhwIjoyMDcwNjIxNjI1fQ.58NWRZsv3lmBFWuVS5QMS5cdI4CyOsamV8M2kc4ozqU"
);

const EXAM_ID = "614e4beb-faa2-4a28-a8e8-2538446042bb";

// ============ 케이스 자료 HTML ============
const caseHTML = [
  '<h1>케이스 스터디: NexonHealth의 글로벌 확장 전략</h1>',
  "<hr/>",

  "<h2>1. 회사 개요</h2>",
  "<p><strong>NexonHealth(넥슨헬스)</strong>는 2020년 서울에서 설립된 디지털 헬스케어 스타트업이다. AI 기반 건강관리 플랫폼을 운영하며 한국 시장에서 빠르게 성장하고 있다.</p>",
  "<table>",
  "<tr><td><strong>설립</strong></td><td>2020년 3월 (서울)</td></tr>",
  "<tr><td><strong>직원 수</strong></td><td>280명 (2025.12 기준)</td></tr>",
  "<tr><td><strong>핵심 제품</strong></td><td>WellSync — AI 건강 모니터링 및 개인화 헬스케어 플랫폼</td></tr>",
  "<tr><td><strong>한국 가입자</strong></td><td>320만 명 (MAU 180만)</td></tr>",
  "<tr><td><strong>2025년 매출</strong></td><td>480억 원 (전년 대비 67% 성장)</td></tr>",
  "<tr><td><strong>누적 투자</strong></td><td>시리즈 C까지 총 1,200억 원</td></tr>",
  "</table>",
  '<p>CEO 박지현은 삼성전자 출신 엔지니어로, "모든 사람이 AI 주치의를 가질 수 있어야 한다"는 비전으로 회사를 설립했다. CTO 김태영은 구글 헬스 출신, CMO 이수진은 네이버 마케팅 부문 출신이다.</p>',

  "<h2>2. 제품 및 기술</h2>",
  "<p><strong>WellSync 플랫폼 핵심 기능:</strong></p>",
  "<ul>",
  "<li><strong>AI 건강 분석</strong>: 웨어러블 데이터(심박수, 수면, 활동량) 실시간 AI 분석</li>",
  "<li><strong>개인화 건강 가이드</strong>: 사용자 프로파일 기반 맞춤 건강 조언</li>",
  "<li><strong>원격 진료 연계</strong>: 제휴 의료기관과의 실시간 원격 상담</li>",
  "<li><strong>만성질환 관리</strong>: 당뇨, 고혈압 등 만성질환자 대상 모니터링</li>",
  '<li><strong>기업 건강관리(B2B)</strong>: "WellSync Enterprise" 임직원 건강관리 솔루션</li>',
  "</ul>",
  "<p><strong>기술 역량:</strong></p>",
  "<ul>",
  '<li>자체 AI 엔진 "HealthMind" — 500만 건 이상의 건강 데이터 학습</li>',
  "<li>국내 3대 대형병원(삼성서울, 서울아산, 세브란스)과 데이터 파트너십</li>",
  "<li>FDA 510(k) 인증 진행 중 (2026년 Q2 예상 승인)</li>",
  "<li>ISO 27001, HIPAA 준비 완료</li>",
  "</ul>",

  "<h2>3. 재무 데이터</h2>",
  "<table>",
  "<tr><th>(단위: 억 원)</th><th>2023년</th><th>2024년</th><th>2025년</th></tr>",
  "<tr><td><strong>매출액</strong></td><td>142</td><td>288</td><td>480</td></tr>",
  "<tr><td>- B2C (개인)</td><td>98</td><td>178</td><td>264</td></tr>",
  "<tr><td>- B2B (기업)</td><td>44</td><td>110</td><td>216</td></tr>",
  "<tr><td><strong>매출총이익</strong></td><td>57</td><td>130</td><td>245</td></tr>",
  "<tr><td><strong>영업비용</strong></td><td>134</td><td>228</td><td>340</td></tr>",
  "<tr><td>- R&D</td><td>52</td><td>88</td><td>130</td></tr>",
  "<tr><td>- 마케팅</td><td>48</td><td>78</td><td>110</td></tr>",
  "<tr><td>- 인건비</td><td>24</td><td>42</td><td>68</td></tr>",
  "<tr><td><strong>영업이익</strong></td><td>-77</td><td>-98</td><td>-95</td></tr>",
  "<tr><td><strong>EBITDA</strong></td><td>-62</td><td>-75</td><td>-65</td></tr>",
  "<tr><td><strong>현금 보유액</strong></td><td>320</td><td>280</td><td>450</td></tr>",
  "<tr><td><strong>월 현금소진율</strong></td><td>12</td><td>15</td><td>18</td></tr>",
  "</table>",

  "<h2>4. 시장 환경</h2>",
  "<p><strong>글로벌 디지털 헬스케어 시장:</strong> 2025년 약 3,500억 달러 / CAGR 18.2% (2025-2030) / 아시아태평양 CAGR 22.5%</p>",
  "<p><strong>한국 시장:</strong> 약 4.5조 원 / NexonHealth 점유율 약 8% (B2C)</p>",
  "<table>",
  "<tr><th>경쟁사 비교</th><th>NexonHealth</th><th>삼성헬스</th><th>카카오헬스</th><th>네이버헬스</th></tr>",
  "<tr><td>MAU (만명)</td><td>180</td><td>1,200</td><td>450</td><td>380</td></tr>",
  "<tr><td>B2B 고객 수</td><td>85개사</td><td>200개사</td><td>120개사</td><td>90개사</td></tr>",
  "<tr><td>AI 정확도</td><td>94.2%</td><td>91.8%</td><td>89.5%</td><td>90.1%</td></tr>",
  "<tr><td>원격진료 연계</td><td>O</td><td>X</td><td>O</td><td>△</td></tr>",
  "<tr><td>만성질환 관리</td><td>O</td><td>△</td><td>X</td><td>O</td></tr>",
  "<tr><td>글로벌 진출</td><td>미진출</td><td>진출</td><td>미진출</td><td>미진출</td></tr>",
  "</table>",

  "<h2>5. 글로벌 확장 검토 — 세 가지 시장 옵션</h2>",
  "<p>NexonHealth 경영진은 2026년 하반기 글로벌 확장을 검토 중이다.</p>",

  "<h3>옵션 A: 일본 시장</h3>",
  "<ul>",
  "<li>시장 규모: 아시아 최대 (약 800억 달러)</li>",
  "<li>고령화율 29.3% (세계 1위) — 만성질환 관리 수요 극대</li>",
  "<li>규제: PMDA 인증 필요, 18-24개월</li>",
  "<li>문화적 유사성 높음, 한류 긍정적 영향</li>",
  "<li>진입 장벽: SoftBank 투자 기업 등 로컬 강자 다수</li>",
  "<li>예상 진입 비용: 150-200억 원</li>",
  "<li>잠재 파트너: Sony Healthcare, Omron Health</li>",
  "</ul>",

  "<h3>옵션 B: 동남아시아 (인도네시아 + 베트남)</h3>",
  "<ul>",
  "<li>합산 인구 3.7억, 중산층 급성장</li>",
  "<li>디지털 헬스케어 침투율 5% 미만 — 블루오션</li>",
  "<li>규제 환경 비교적 느슨</li>",
  "<li>인프라 부족 (인터넷, 의료 접근성)</li>",
  "<li>예상 진입 비용: 80-120억 원</li>",
  "<li>잠재 파트너: Gojek (인도네시아), VinGroup (베트남)</li>",
  "</ul>",

  "<h3>옵션 C: 미국 시장</h3>",
  "<ul>",
  "<li>세계 최대 시장 (약 1,500억 달러)</li>",
  "<li>FDA 인증 진행 중 (2026 Q2 완료 예상)</li>",
  "<li>경쟁 극심: Apple Health, Teladoc, Livongo 등</li>",
  "<li>진입 시 글로벌 신뢰도 및 브랜드 가치 극대화</li>",
  "<li>예상 진입 비용: 500-800억 원</li>",
  "<li>잠재 파트너: CVS Health, UnitedHealth Group</li>",
  "</ul>",

  "<h2>6. 경영진 의견</h2>",
  '<blockquote><strong>CEO 박지현:</strong> "다음 시리즈 D 라운드를 위해서는 글로벌 시장에서의 의미 있는 트랙션이 필수적입니다. 투자자들은 한국 시장만으로는 유니콘 밸류에이션을 지지하지 않을 것입니다."</blockquote>',
  '<blockquote><strong>CFO 정민호:</strong> "월 18억 원의 현금 소진 속도를 고려하면, 글로벌 확장에 투입할 수 있는 예산은 최대 200-250억 원입니다. 시리즈 D는 2027년 Q1 전에 마감해야 합니다."</blockquote>',
  '<blockquote><strong>CTO 김태영:</strong> "HealthMind AI 엔진의 현지화에는 시장당 최소 6개월의 데이터 수집과 모델 리트레이닝이 필요합니다. 동시에 2개 시장 진출 시 R&D 팀 분산으로 AI 정확도 하락 리스크가 있습니다."</blockquote>',
  '<p><strong>이사회 압력:</strong> 시리즈 C 리드 투자자 소프트뱅크벤처스는 <strong>"2027년까지 ARR 1,000억 원 달성"</strong>을 요구. 현재 ARR 약 520억 원, 한국 시장만으로는 연간 30-40% 성장이 한계.</p>',

  "<h2>7. 추가 참고 데이터</h2>",
  "<table>",
  "<tr><th>진입 방식 비교</th><th>직접 진출</th><th>합작투자(JV)</th><th>인수합병(M&A)</th></tr>",
  "<tr><td>초기 투자</td><td>중간</td><td>낮음</td><td>높음</td></tr>",
  "<tr><td>시장 진입 속도</td><td>느림</td><td>중간</td><td>빠름</td></tr>",
  "<tr><td>통제력</td><td>높음</td><td>중간</td><td>높음</td></tr>",
  "<tr><td>리스크</td><td>높음</td><td>중간</td><td>매우 높음</td></tr>",
  "<tr><td>문화적 적응</td><td>어려움</td><td>쉬움</td><td>중간</td></tr>",
  "</table>",
  "<table>",
  "<tr><th>규제 타임라인</th><th>기간</th></tr>",
  "<tr><td>일본 (PMDA)</td><td>18-24개월</td></tr>",
  "<tr><td>인도네시아 (BPOM)</td><td>6-12개월</td></tr>",
  "<tr><td>베트남 (MOH)</td><td>8-14개월</td></tr>",
  "<tr><td>미국 (FDA)</td><td>12-18개월 (이미 6개월 진행)</td></tr>",
  "</table>",
  "<table>",
  "<tr><th>직원 역량</th><th>인원</th></tr>",
  "<tr><td>일본어 가능</td><td>12명</td></tr>",
  "<tr><td>영어 가능</td><td>45명</td></tr>",
  "<tr><td>인도네시아/베트남어 가능</td><td>3명</td></tr>",
  "<tr><td>해외 사업 경험 임원</td><td>CEO (미국), CMO (일본)</td></tr>",
  "</table>",
  "<hr/>",
].join("\n");

// ============ 문제 구성 ============
const questions = [
  {
    id: "q-0",
    idx: 0,
    type: "essay",
    text:
      caseHTML +
      "\n" +
      [
        "<h1>문제 1. 시장 분석 및 진출 시장 선택 (25점)</h1>",
        '<p>위 케이스 자료의 세 가지 글로벌 시장 옵션(일본, 동남아시아, 미국)을 <strong>전략적 관점</strong>에서 비교 분석하시오.</p>',
        "<p>분석 시 다음 요소를 반드시 포함하시오:</p>",
        "<ul>",
        "<li>각 시장의 매력도 (시장 규모, 성장성, 경쟁 강도)</li>",
        "<li>NexonHealth의 역량과 각 시장의 적합성 (자원 기반 관점)</li>",
        "<li>리스크 요인 (규제, 문화, 재무)</li>",
        "</ul>",
        "<p>분석을 바탕으로 <strong>NexonHealth가 우선 진출해야 할 시장 1곳</strong>을 선택하고, 그 이유를 논리적으로 설명하시오.</p>",
        "<blockquote>AI 튜터에게 전략 프레임워크(Porter's 5 Forces, CAGE Distance 등)의 적용 방법이나 시장 데이터 해석에 대해 질문할 수 있습니다.</blockquote>",
      ].join("\n"),
    ai_context:
      '이 문제는 시장 분석 능력을 평가합니다. 학생이 Porter\'s 5 Forces, CAGE Distance Framework, PESTEL 분석 등의 프레임워크 적용법을 물으면 친절하게 안내해주세요. 단, "일본이 최적이다" 같은 결론은 제시하지 마세요.',
  },
  {
    id: "q-1",
    idx: 1,
    type: "essay",
    text: [
      "<h2>문제 2. 진입 전략 수립 (25점)</h2>",
      "<p>문제 1에서 선택한 시장에 대한 <strong>구체적인 진입 전략</strong>을 수립하시오.</p>",
      "<ol>",
      "<li><strong>진입 방식</strong>: 직접 진출, 합작투자(JV), 인수합병(M&A) 중 선택하고 근거 제시</li>",
      "<li><strong>목표 고객 세그먼트</strong>: B2C/B2B 비중 및 우선 타겟 고객층</li>",
      "<li><strong>가치 제안(Value Proposition)</strong>: 현지 시장에서의 차별화 포인트</li>",
      "<li><strong>파트너십 전략</strong>: 잠재 파트너와의 협력 구조</li>",
      "<li><strong>타임라인</strong>: 12개월 단위의 마일스톤</li>",
      "</ol>",
      "<blockquote>진입 방식의 장단점이나 현지화 전략에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>",
    ].join("\n"),
    ai_context:
      "이 문제는 전략 수립 능력을 평가합니다. 학생이 진입 방식(직접진출 vs JV vs M&A)의 비교를 물으면 케이스 자료의 비교표를 참고하여 설명하되, 어떤 방식이 최적인지 직접 답하지는 마세요.",
  },
  {
    id: "q-2",
    idx: 2,
    type: "essay",
    text: [
      "<h2>문제 3. 재무 분석 및 투자 타당성 (25점)</h2>",
      "<p>케이스 자료의 재무 데이터를 활용하여 NexonHealth의 <strong>재무 상황</strong>을 분석하고, 글로벌 확장의 <strong>투자 타당성</strong>을 평가하시오.</p>",
      "<ol>",
      "<li><strong>현재 재무 건전성 분석</strong>: 수익성, 현금흐름, 런웨이 분석</li>",
      "<li><strong>글로벌 확장 소요 비용 추정</strong>: 선택한 시장의 예상 투자 비용과 회수 기간</li>",
      "<li><strong>시리즈 D 달성 조건 분석</strong>: ARR 1,000억 원 달성을 위한 시나리오</li>",
      "<li><strong>리스크-수익 트레이드오프</strong>: 확장하지 않을 때의 리스크 vs 확장의 리스크</li>",
      "</ol>",
      "<blockquote>재무 비율 계산법이나 벨류에이션 프레임워크에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>",
    ].join("\n"),
    ai_context:
      "이 문제는 재무 분석 능력을 평가합니다. 학생이 런웨이 계산법, Burn Rate 분석, ARR 성장 모델링 등을 물으면 계산 방법을 안내해주세요. 직접 답을 제시하지 말고 학생이 직접 계산하도록 유도하세요.",
  },
  {
    id: "q-3",
    idx: 3,
    type: "essay",
    text: [
      "<h2>문제 4. 전략적 리더십과 의사결정 (25점)</h2>",
      "<p>당신이 NexonHealth의 <strong>이사회 멤버</strong>라고 가정하십시오. 케이스 자료에 제시된 경영진의 글로벌 확장 검토 내용을 바탕으로 다음을 작성하시오:</p>",
      "<ol>",
      "<li><strong>비판적 평가</strong>: 현재 글로벌 확장 계획의 가장 큰 약점 또는 간과된 리스크 2가지를 지적하시오</li>",
      "<li><strong>대안 제시</strong>: 글로벌 확장 외에 NexonHealth가 고려할 수 있는 성장 전략 대안은 무엇인가?</li>",
      '<li><strong>최종 의사결정</strong>: 이사회 멤버로서 "글로벌 확장 진행" 또는 "확장 연기"를 선택하고, 설득력 있는 논거를 제시하시오</li>',
      "</ol>",
      "<p><em>이 문제에는 정답이 없습니다. 논리의 일관성과 설득력을 평가합니다.</em></p>",
      "<blockquote>전략적 의사결정 프레임워크나 리스크 평가 방법에 대해 AI 튜터에게 질문할 수 있습니다.</blockquote>",
    ].join("\n"),
    ai_context:
      '이 문제는 비판적 사고력과 전략적 의사결정 능력을 평가합니다. "확장해야 한다/하지 말아야 한다"는 결론은 절대 제시하지 마세요. 소크라테스식 질문으로 사고를 확장시켜주세요.',
  },
];

async function main() {
  const { error } = await supabase
    .from("exams")
    .update({ questions })
    .eq("id", EXAM_ID);

  if (error) {
    console.error("Update failed:", error.message);
    process.exit(1);
  }

  console.log("Questions updated!");

  const { data } = await supabase
    .from("exams")
    .select("questions")
    .eq("id", EXAM_ID)
    .single();

  data.questions.forEach((q, i) => {
    console.log(`  Q${i}: ${q.text.length} chars`);
  });
}

main();
