# Quest-On LinkedIn, AI가 채점 전에 교수를 인터뷰하는 이유 (target 2026-07-22)

> 플레이북: [../PLAYBOOK.md](../PLAYBOOK.md)
> 카피 상태: **발행 후보 v6 — 기존 발행본 4개·수정 이력·코드 사실·4:5 A/B 비주얼을 다시 맞춰 회사/개인 본문 전면 재작성**.
> 앵글(이번 주): **소구점 = "AI가 점수를 낸 뒤에만 사람을 두지 않고, 채점 전에 샘플의 경계 사례를 놓고 교수에게 먼저 묻는다."** 경쟁사의 `빠른 채점·일관성·교사 최종 통제`와 겹치는 표현보다, Quest-On의 구체적인 앞단 메커니즘을 보여준다.
> 메인 서사: 초기 화면의 `채점 기준을 입력해주세요` → 빈 입력칸이 교수에게 가장 어려운 일을 돌려준다는 발견 → 샘플 답안 기반 AI 인터뷰로 변경. 현재 형태의 기능은 2026-06-22 커밋 `60f179e`, 후속 개선은 `b89aec6`에서 도입됐다.
> 구현 표현 가드: **기본 가채점 흐름**, **최대 3개 자동 선정 샘플**, **제출된 서술형·CASE 답안의 제안 점수**, **기준과 점수 범위까지 묻도록 설계**, **교수 검토·점수 수정·확정**까지만 말한다. 실제 사용량·시간 절감·정확도·공정성은 주장하지 않는다.
> 발행 원칙: 개인 계정(영준) 오리지널이 메인, 회사 페이지는 리포스트 보강. 본문 링크 0개. 해시태그는 끝에 3개. 7/22(수) 오전 10~11시 KST 권장.

---

## 1. 회사 페이지 (한국어 본문)

설명용으로 만든 두 가상 답안 중 어느 쪽을 더 높게 채점하시겠어요?

A는 실행 근거가 구체적이지만 STP와 4P 일부가 빠졌습니다. B는 핵심 개념을 모두 언급했지만 근거가 얕습니다.

논리, 핵심 개념, 완성도. 여기까지는 적을 수 있습니다. 그런데 실제 답안을 앞에 놓으면 적어둔 말만으로 잘 갈리지 않는 순간이 생깁니다. 질문은 깊었지만 최종 답안이 약한 학생, 여러 조건을 빠짐없이 다뤘지만 자기 근거가 얕은 학생처럼요.

교수님이 기준을 모르는 게 아니었습니다. 루브릭에 적은 말과 실제 답안을 보며 내리는 판단 사이에 거리가 있었습니다.

그래서 Quest-On은 점수를 내기 전에 질문부터 합니다. 제출된 샘플 답안과 학생-AI 대화를 먼저 보고 애매한 지점을 하나씩 교수님께 묻습니다. 답을 들으면 다른 경계 사례를 이어서 묻고 점수 범위까지 맞춘 뒤 가채점을 시작합니다.

점수는 초안으로 남습니다. 교수님이 답안과 피드백을 확인하고 필요한 부분을 고친 뒤 확정합니다.

루브릭을 더 길게 쓰게 하기보다 실제 답안을 놓고 이미 하고 있는 판단을 말로 꺼내는 쪽을 택했습니다.

채점 AI를 만들면서 점수를 잘 내는 법보다 사람에게 무엇을 먼저 물어야 할지를 더 오래 보고 있습니다.

실제 채점에서는 어떤 답안 앞에서 적어둔 기준만으로 결정하기 어려워지나요?

English version & 데모 링크는 첫 댓글에 👇

#에듀테크 #AI평가 #AssessmentTech

---

## 2. 영문 버전 (첫 댓글)

> 게시 후 30초 이내에 본인이 직접. 데모 링크를 넣으면 총 1,250자 이내인지 다시 확인한다.

Which answer would you grade higher?

In this illustrative example, A gives concrete reasons but misses part of STP and 4P. B covers the core concepts but barely connects them to evidence.

The first version of Quest-On’s AI grading screen had one large field: “Enter your grading criteria.” It sounded reasonable. In practice, it handed the hardest part of grading back to the instructor.

An instructor can write reasoning, concepts, and completeness. Borderline answers still remain. The criteria become clearer when there is an actual answer in front of them.

So we removed the empty field. Before drafting scores, Quest-On reviews submitted samples and the students’ AI conversations, then asks the instructor about one difficult case at a time. It follows the answers, clarifies the score range, and only then begins pre-grading.

The scores remain drafts. The instructor reviews the answers and feedback, edits them where needed, and confirms the final grades.

We are learning that human judgment cannot begin only after AI produces a score. It has to shape the criteria first.

Which kinds of answers are hardest to settle with a written rubric alone?

Demo: https://quest-on.app

---

## 3. 영준 개인 계정 (오리지널, 1인칭), 메인 권장

설명용으로 가상 답안 둘을 만들어봤습니다. A는 실행 근거가 구체적이지만 STP와 4P 일부가 빠졌고 B는 핵심 개념을 다 썼지만 근거가 얕습니다. 그런데 처음 만든 AI 가채점 화면은 이런 경우에도 교수님께 이렇게 말했습니다.

“채점 기준을 입력해주세요.”

지금 보면 좀 무책임한 문장이었습니다. 채점을 도와주겠다면서 가장 어려운 일은 다시 교수님께 넘겨놓았으니까요.

처음 화면은 기준을 입력받으면 그다음부터 AI가 처리하는 구조였습니다. 논리, 핵심 개념, 완성도 같은 항목과 비중을 적는 방식이었어요.

그런데 두 답안 사이를 가르려 하면 금세 막힙니다.

둘 중 어느 쪽을 더 높게 봐야 할까요?

여기서 ‘논리 40, 개념 30’이라는 숫자는 별 도움이 되지 않았습니다. 과목에서 무엇을 가르쳤는지, 이 문제에서 무엇을 보려 했는지에 따라 판단이 달라집니다.

교수님이 기준을 모르는 게 아니었습니다. 저희가 만든 빈칸이 그 기준을 꺼내지 못하고 있었어요.

그래서 그 입력칸을 없앴습니다.

지금은 AI가 점수를 내기 전에 먼저 제출된 답안과 학생이 AI와 나눈 대화를 읽습니다. 애매한 답안을 하나 짚어 교수님께 묻고 답을 들으면 비슷하게 어려운 경우를 하나 더 묻습니다. 그렇게 기준을 맞춘 뒤에야 가채점을 시작합니다.

점수는 여전히 교수님이 고치고 확정합니다. 처음 화면에서 사람의 역할은 마지막 검토에 가까웠습니다. 지금은 그때면 늦다고 봅니다. AI가 어떤 기준으로 일할지 정하는 순간부터 사람의 판단이 필요했습니다.

채점 AI를 만들다가 결국 질문부터 다시 만들게 됐습니다.

#에듀테크 #스타트업 #AI평가

---

## 최종 첨부 비주얼

- 발행 파일: [assets/2026-07-22/grading-interview-linkedin.png](assets/2026-07-22/grading-interview-linkedin.png) — `1080×1350`, LinkedIn 피드용 4:5.
- 편집 원본: [assets/2026-07-22/grading-interview-linkedin.html](assets/2026-07-22/grading-interview-linkedin.html).
- 재생성: `node scripts/render-linkedin-grading-interview.mjs`.
- 실제 가채점 흐름을 Quest-On 제품 UI 톤으로 설명한 A/B 재구성 화면이다. 실제 제품이 A/B 카드를 나란히 보여준다는 뜻은 아니다. 구현에서는 제출 순서 구간에서 최대 3개 샘플을 자동 선정해 인터뷰에 참고한다.
- 가상 문제와 답안은 공개 랜딩 데모의 가상 기업 `그린휠 E-Prime One`을 바탕으로 만들었다. 이미지 상단에 `설명용 가상 샘플 · 실제 학생 답안 아님`을 표시하며, 실사용자 이름·답안·대화·점수와 운영 DB는 사용하지 않는다.
- A는 실행 근거가 구체적이지만 STP와 4P 일부가 빠진 답안, B는 핵심 개념을 포함했지만 근거 연결이 약한 답안이다. 어느 쪽에도 점수나 정답·우열을 미리 붙이지 않고 가운데 `판단 경계`만 표시한다.
- 각 카드에는 학생-AI 대화에서 확인할 수 있는 탐색 맥락을 요약해 함께 보여준다. 아래 인터뷰에서 AI가 어느 답안을 더 높게 볼지 교수에게 묻고, 빠른 답변과 직접 입력창을 제공한다.
- 하단에는 `최종 답안과 학생-AI 대화도 함께 참고`, `AI 점수는 제안일 뿐, 최종 확정은 교수님이 합니다`를 명시한다. 가짜 정확도·시간 절감·사용량 수치는 없다.
- 접근성용 대체 텍스트: `Quest-On CASE AI 가채점의 채점 전 기준 설정 흐름을 설명용으로 재구성한 화면. 가상 문제 아래에 실행 근거가 구체적이지만 STP와 4P 일부가 빠진 A 답안과 핵심 개념은 포함했지만 근거 연결이 약한 B 답안이 나란히 보이고, 가운데에 판단 경계가 표시되어 있다. 아래에서 AI가 교수에게 어느 답안을 더 높게 평가할지 묻고 세 가지 빠른 답변과 직접 입력창을 보여준다. 설명용 가상 샘플이며 실제 학생 답안이 아니라는 안내, 학생-AI 대화 참고, AI 점수는 제안이며 최종 확정은 교수라는 안내가 함께 표시되어 있다.`

---

## 발행 운영 노트

게시 순서(개인 오리지널 우선, 회사 페이지 보강):

1. D-1: 영준 개인 글을 모바일 세로 모드로 미리보기. 이미지 첨부 상태에서 첫 훅이 `더 보기` 전에 자기완결되는지 확인한다.
2. 발행: 7/22(수) 오전 10~11시 KST 권장. 대안은 7/21(화) 또는 7/23(목) 같은 시간대.
3. 0~30초: 영문 첫 댓글을 본인이 직접 단다. 데모 링크는 본문이 아니라 댓글에 둔다.
4. 0~60분: 댓글에 15분 이내로 답한다. 팀원 댓글은 각자 실제로 기능을 만들거나 논의하며 본 장면을 적는다.
5. 5~30분: 팀원과 회사 페이지는 개인 오리지널을 리포스트해 보강한다.
6. 같은 내용을 24시간 안에 다시 게시하지 않는다.

추천 팀원 첫 댓글 방향:

- 개발: `빈 기준 입력창 대신 AI가 먼저 질문하도록 바꾸면서 가장 어려웠던 점`
- 제품: `애매한 답안 사례가 정적 루브릭보다 기준을 더 빨리 드러낸 이유`
- 운영: `교수에게 기능 설명보다 실제 답안 두 개를 보여주는 편이 대화가 빨랐던 경험` — 실제 경험이 있을 때만 사용

---

## 사실·공개 가드

공개 가능한 구현 사실:

- AI가 먼저 인터뷰를 시작한다.
- 자동 선정된 샘플 학생 데이터와 학생-AI 대화를 참고한다.
- 한 답변에 짧은 후속 질문 하나를 이어간다.
- 애매한 사례와 우선순위를 묻고 기준을 요약한다.
- 전체 가채점 전 최저·최고 점수 범위를 묻고 정리하도록 설계되어 있다.
- 일정 인터뷰 라운드 후 `여기까지만 질문받고 일단 채점 진행`으로 넘어갈 수 있다.
- 가채점은 제안 점수이며, 교수 검토·수정·확정이 별도로 남는다.

본문·이미지에서 금지할 주장:

- `채점 정확도 N% 향상`, `채점 시간 N% 감소` 등 실측하지 않은 효과.
- `교수의 개입이 필요 없다`, `완전 자동 채점`, `AI가 최종 성적을 결정한다`.
- 샘플이 통계적으로 대표성을 보장한다는 표현.
- 실제 교수·학생의 발언처럼 보이는 합성 예시. 예시를 쓸 때는 제품 동작을 설명하는 가상 사례로만 둔다.
- 학생 이름·답안·대화 원문·점수·시험 코드·교수 실명.

구현 근거:

- `lib/prompts.ts`: AI 선행 인터뷰, 샘플 기반 질문, 애매한 사례, 기준 요약, 점수 범위 확인.
- `lib/bulk-grade-thread.ts`: 최소 인터뷰 라운드와 대화 상태 전환.
- `components/instructor/BulkGradingPanel.tsx`: 빠른 답변 선택지, 인터뷰 진행, 건너뛰기, 가채점 시작 UI.
- `app/api/exam/[examId]/bulk-grade/chat/route.ts`: 인터뷰 완료 검증과 점수 범위 확정.
- `messages/ko/grading.json`: 실제 한국어 UI 문구.

DB 확인 범위:

- 이번 작업에서는 운영 DB를 조회하지 않았다. 저장소가 요구하는 `docs/CODEX_DB_SAFETY.md`가 현재 트리에 없고, 정확한 localhost/127.0.0.1 disposable DB URL도 확인되지 않았기 때문이다.
- 따라서 실제 기능 사용량·완주율·교수 반응·시간 절감 수치는 확인하거나 주장하지 않는다. 코드·Git 이력·공개 자료만 읽기 전용으로 검증했다.

---

## 유사 회사·한국 LinkedIn 리서치 요약

> 공개 원문의 반응 수는 2026-07-20 확인값. 계정 규모와 게시 시점이 달라 절대 성과 비교가 아니라 카피·포맷 방향 판단에만 사용한다.

| 사례 | 공개 메시지·포맷 | 반응 / 댓글 | 이번 글에 주는 시사점 |
|---|---|---:|---|
| [Inspera × Graide](https://www.linkedin.com/posts/inspera_inspera-a-leading-provider-of-digital-assessment-activity-7469674619143229442-319N) | 시간·피드백 수치, educator-in-control, 단일 이미지 | 89 / 6 | 숫자 주장은 강하지만 Quest-On에는 아직 검증 수치가 없어 차용하지 않는다. |
| [Graide × NCFE 파일럿](https://www.linkedin.com/posts/graide_assessment-edtech-aiineducation-activity-7419657555058270209-Z7C1) | 실제 파일럿, human moderator, 투명성 | 23 / 5 | `사람이 최종 통제`만으로는 차별화가 어렵다. |
| [Questionmark AI Scoring](https://www.linkedin.com/posts/questionmark_our-ai-scoring-capability-helps-organizations-activity-7478800017009393665-ZjMw) | 서술형 대규모 채점, 최종 점수 통제 | 4 / 0 | 기능 목록형 메시지는 토론을 만들기 어렵다. |
| [튜링 서술형 채점](https://kr.linkedin.com/posts/team-cookie_%ED%8A%9C%EB%A7%81-%EC%88%98%ED%95%99%EB%8C%80%EC%99%95-%EC%84%9C%EC%88%A0%ED%98%95-activity-7427588043081023488-ZPaC) | `채점 지옥 10분 만에 해결`, 단일 이미지 | 5 / 0 | 검증 없는 시간 절감 경쟁 대신 제품의 실제 메커니즘을 보여준다. |
| [Code.org 교사 채점 사례](https://www.linkedin.com/posts/code-org_this-ai-tool-cut-one-teachers-grading-time-activity-7183941977665667075-izMx) | 교사의 구체적인 전후 장면 | 86 / 2 | 제품 소개보다 사람과 구체적 장면이 강하다. |
| [최완섭 — 상담 AI 후평가](https://kr.linkedin.com/posts/wansupchoi_%EC%83%81%EB%8B%B4-ai-agent%EB%8A%94-%ED%95%9C-%EB%B2%88-%EC%84%B8%ED%8C%85%ED%95%98%EB%A9%B4-%EB%81%9D%EC%9D%B4-%EC%95%84%EB%8B%99%EB%8B%88%EB%8B%A4-%EA%B4%80%EB%A6%AC%ED%95%B4%EC%95%BC-%ED%95%B4%EC%9A%94-activity-7447787868653121537-nhMw) | 통념 반전 → 실패 사례 → 평가 기능 → 철학 | 60 / 0 | 기능보다 `왜 이 순서로 설계했는가`를 전면에 둔다. |
| [Sendbird — Trust OS](https://www.linkedin.com/posts/doshkim_trust-in-ai-is-broken-were-rebuilding-it-activity-7356373565027373056-joWH) | 강한 문제 선언 → 고객 대화 → 제품 원칙 | 233 / 9 | 문제 선언 뒤에 실제 설계 장면을 바로 붙인다. |

리서치 결론:

- 빠른 채점, 일관성, 교사 최종 통제는 이미 경쟁사가 반복해서 쓰는 언어다.
- 공개 마케팅에서 상대적으로 비어 있던 장면은 `AI가 점수를 내기 전에 샘플의 경계 사례를 들고 교수에게 묻는다`였다.
- `업계 최초`, `유일`, `더 공정함`은 주장하지 않는다. 차이는 수식어가 아니라 실제 흐름으로 보여준다.
- 한국 LinkedIn에서도 일반적인 제품·시장 글보다 빌더/사용자의 구체적인 장면과 검증 가능한 근거가 있는 글이 더 강했다.

---

## 평가 연구 근거

- [Ofqual — Online standardisation of assessors](https://www.gov.uk/government/publications/effective-practice-for-online-standardisation-of-assessors/online-standardisation-of-assessors-effective-practice-identified-through-research): 실제 채점 전 mark scheme과 실제 답안, 반복 적용, 확정 점수와 rationale를 함께 사용한다. Quest-On과 동일한 절차라는 뜻은 아니며, `실제 답안을 매개로 기준을 구체화한다`는 평가 원리를 뒷받침한다.
- [O’Donovan, Price & Rust (2004)](https://doi.org/10.1080/1356251042000216642): 평가 기준을 명시적으로 적는 것만으로는 의미 있는 기준 지식을 모두 전달하기 어렵고, 명시적 지식과 암묵지를 함께 다룰 구조화된 과정이 필요하다고 본다.
- [Wyatt-Smith, Klenowski & Gunn (2010)](https://doi.org/10.1080/09695940903565610): 교사 moderation에서 명시된 기준, 학생 답안 샘플, 암묵지, 대화와 협상이 함께 작동함을 관찰했다.
- [Ofqual — Principles of AI use in marking](https://www.gov.uk/government/publications/principles-of-ai-use-in-marking/principles-of-ai-use-in-marking): 사람 점수와의 일치만으로 타당성이 보장되지 않으며, 고위험 채점에는 의미 있는 인간 감독과 책임이 필요하다고 정리한다.

안전한 해석은 `루브릭만으로 실제 판단이 다 드러나지 않을 수 있고, 실제 답안을 함께 보는 표준화·moderation 관행이 존재한다`까지다. 이 기능이 정확도·공정성·일관성을 높였다는 제품 성과 근거로 사용하지 않는다.

---

## 버전 메모

- 이번 글은 6/24 `학생의 사고 과정` → 6/30 `과정 기반 과제 참여` 다음에 오는 `교수의 판단 과정` 편이다.
- 원격 `cursor/professor-grading-roi-linkedin-e263`의 7/8 초안은 `AI 가채점 초안 + 교수 확정`이 중심이다. 이번 글은 그보다 앞단인 `기준을 어떻게 얻는가`를 다루므로 중복되지 않는다.
- 7/8 초안의 `교수가 기준을 한 번 말하거나 적는다`는 설명은 최신 선행 인터뷰 흐름을 충분히 반영하지 못한다. 이번 문서의 구현 가드를 우선한다.
- v6에서 기존 6/6·6/14·6/24·6/30 발행본과 6/6 탈AI화 수정 이력을 다시 읽었다. 회사 글은 `기능 추가` 훅을 버리고 A/B 경계 사례에서 시작하도록, 개인 글은 빈 입력칸을 만든 사람의 잘못된 가정과 설계 수정이 시간 순서로 보이도록 전면 재작성했다.
- 이미지가 메커니즘을 설명하므로 본문에서는 `최대 3개`, `서술형·CASE`, 세부 인터뷰 라운드 같은 사양 나열을 덜어냈다.
- 개인 글은 제품 기능 나열보다 `입력칸으로 받을 수 없는 판단을 발견한 빌더의 학습`을 중심으로 썼다.
- `humanize-korean` 보수 윤문(2026-07-20-001): 회사·개인 한국어 본문 변경률 2.14%, 자체검증 6/6, S1 잔존 0건. 연결어미 뒤 쉼표와 추상적인 문장만 정리했고 수치·기능 사실·고유명사는 보존했다.
- 현장 실측이나 교수 후기 없이도 성립하도록 기능·설계 철학만 사용했다.
