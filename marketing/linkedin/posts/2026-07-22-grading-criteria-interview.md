# Quest-On LinkedIn, AI가 채점 전에 교수를 인터뷰하는 이유 (target 2026-07-22)

> 플레이북: [../PLAYBOOK.md](../PLAYBOOK.md)
> 카피 상태: **발행 후보 v3 — 코드·Git 이력·기존 보이스·한국 LinkedIn·유사 서비스·평가 연구·4:5 비주얼 교차검증 반영**.
> 앵글(이번 주): **소구점 = "AI가 점수를 낸 뒤에만 사람을 두지 않고, 채점 전에 샘플의 경계 사례를 놓고 교수에게 먼저 묻는다."** 경쟁사의 `빠른 채점·일관성·교사 최종 통제`와 겹치는 표현보다, Quest-On의 구체적인 앞단 메커니즘을 보여준다.
> 메인 서사: 초기 화면의 `채점 기준을 입력해주세요` → 빈 입력칸이 교수에게 가장 어려운 일을 돌려준다는 발견 → 샘플 답안 기반 AI 인터뷰로 변경. 현재 형태의 기능은 2026-06-22 커밋 `60f179e`, 후속 개선은 `b89aec6`에서 도입됐다.
> 구현 표현 가드: **기본 가채점 흐름**, **최대 3개 자동 선정 샘플**, **제출된 서술형·CASE 답안의 제안 점수**, **기준과 점수 범위까지 묻도록 설계**, **교수 검토·점수 수정·확정**까지만 말한다. 실제 사용량·시간 절감·정확도·공정성은 주장하지 않는다.
> 발행 원칙: 개인 계정(영준) 오리지널이 메인, 회사 페이지는 리포스트 보강. 본문 링크 0개. 해시태그는 끝에 3개. 7/22(수) 오전 10~11시 KST 권장.

---

## 1. 회사 페이지 (한국어 본문)

AI에게 채점을 시키기 전에, 먼저 교수님을 인터뷰하게 했습니다.
“논리는 탄탄하지만 핵심 개념이 빠진 답안은 몇 점인가요?”

루브릭에 `논리 40 · 개념 30 · 완성도 30`이라고 적어도 경계는 남습니다. 질문은 깊었지만 최종 답안이 약한 학생을 어디까지 인정할지, 여러 조건을 두루 다룬 답과 하나를 깊게 파고든 답 중 무엇을 더 높게 볼지는 숫자만으로 정하기 어렵습니다.

그래서 Quest-On의 기본 가채점 흐름은 짧은 인터뷰로 시작합니다.

1. 제출된 답안 중 최대 3개의 샘플과 학생-AI 대화를 먼저 봅니다.
2. AI가 한 번에 질문 하나를 던지고, 교수님의 답에 따라 애매한 사례를 더 묻습니다.
3. 기준과 점수 범위를 대화로 정리한 뒤, 제출된 서술형·CASE 답안의 점수 초안을 만듭니다.

이 점수는 제안입니다. 교수님이 피드백을 확인하고 필요한 점수를 고친 뒤, 별도로 확정합니다.

루브릭을 더 길게 쓰게 하기보다, 실제 답안을 보며 이미 하고 있는 판단을 질문으로 꺼내고 싶었습니다.

실제 채점에서 루브릭으로 다 설명하기 어려운 기준은 어떤 것인가요?

English version & 데모 링크는 첫 댓글에 👇

#에듀테크 #AI평가 #AssessmentTech

---

## 2. 영문 버전 (첫 댓글)

> 게시 후 30초 이내에 본인이 직접. 데모 링크를 넣으면 총 1,250자 이내인지 다시 확인한다.

Before Quest-On drafts a score, its default grading flow interviews the instructor:

“How would you score an answer with strong reasoning but a missing core concept?”

A rubric may say reasoning 40, concepts 30, completeness 30. It still cannot settle every borderline case: a thoughtful research process with a weak final answer, or a broad answer versus one deep insight.

Quest-On first reviews up to three submitted samples and the students’ AI conversations. It then asks one question at a time, following up on the instructor’s priorities and difficult cases. The flow is designed to turn the conversation into grading criteria, including a score range, before drafting scores for the submitted open-ended responses.

The scores remain drafts. The instructor reviews the feedback, edits scores where needed, and confirms the final grades.

Human oversight should not begin only after an AI produces an answer. It should shape the standards the AI works from.

What do you look for in grading that no rubric fully captures?

Demo: https://quest-on.app

---

## 3. 영준 개인 계정 (오리지널, 1인칭), 메인 권장

저희가 처음 만든 AI 가채점 화면에는 빈칸이 하나 있었습니다.
“채점 기준을 입력해주세요.”

처음엔 자연스러워 보였습니다. 그런데 화면을 다시 보니, 채점에서 가장 어려운 일을 교수님께 그대로 돌려준 셈이었습니다.

`논리 40 · 개념 30 · 완성도 30`이라고 적어도 애매함은 남았습니다. 논리는 탄탄한데 핵심 개념을 빠뜨린 답안은 몇 점일까요? 질문은 깊었지만 최종 답안이 약한 학생은 어디까지 인정해야 할까요?

교수님이 기준을 모르는 게 아니었습니다. 실제 기준은 이런 답안을 앞에 놓았을 때 훨씬 구체적으로 드러났습니다.

그래서 입력칸 대신 AI가 먼저 질문하도록 바꿨습니다.

Quest-On의 기본 가채점 흐름에서 AI는 제출된 답안 중 최대 3개의 샘플과 학생-AI 대화를 먼저 봅니다. 그리고 교수님께 한 번에 질문 하나를 던집니다.

교수님이 답하면 다른 경계 사례를 이어서 묻습니다. 무엇을 더 중요하게 보는지, 예외는 어디까지 인정할지, 점수 범위는 어떻게 잡을지 대화로 정리하도록 설계했습니다. 그 다음에야 제출된 서술형·CASE 답안의 제안 점수를 만듭니다.

제안 점수는 최종 성적이 아닙니다. 교수님이 피드백을 확인하고 필요한 점수를 고친 뒤 확정합니다.

기능을 만들면서 알게 된 건, 사람을 마지막 검토 단계에만 두면 늦다는 점이었습니다. AI가 어떤 기준으로 일할지 정하는 순간부터 교수님의 판단이 들어가야 한다고 봤습니다.

실제 채점에서 루브릭으로 다 설명하기 어려운 기준은 어떻게 꺼내고 계신가요?

#에듀테크 #스타트업 #AI평가

---

## 최종 첨부 비주얼

- 발행 파일: [assets/2026-07-22/grading-interview-linkedin.png](assets/2026-07-22/grading-interview-linkedin.png) — `1080×1350`, LinkedIn 4:5.
- 편집 원본: [assets/2026-07-22/grading-interview-linkedin.html](assets/2026-07-22/grading-interview-linkedin.html).
- 재생성: `node scripts/shoot-linkedin-grading-interview.mjs`.
- 제품 화면을 바탕으로 재구성한 더미 UI다. 실사용자 이름·답안·시험명·점수는 들어 있지 않다.
- 이미지의 한 가지 중심 장면은 `논리는 탄탄하지만 핵심 개념이 빠진 답안은 몇 점인가요?`라는 인터뷰 질문이다. 가짜 정확도·시간 절감·사용량 수치는 넣지 않았다.
- 이미지 하단에 `샘플 답안 → 교수 인터뷰 → 제안 점수`, `최종 확정: 교수님`을 함께 보여줘 권한 경계를 명시했다.
- 접근성용 대체 텍스트: `Quest-On의 CASE AI 가채점 더미 화면. AI가 샘플 답안을 본 뒤 교수에게 “논리는 탄탄하지만 핵심 개념이 빠진 답안은 몇 점인가요?”라고 묻고, 샘플 답안→교수 인터뷰→제안 점수 순서를 보여준다.`

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
- 개인 글은 제품 기능 나열보다 `입력창으로 받을 수 없는 암묵지`를 발견한 빌더의 학습을 중심으로 썼다.
- 현장 실측이나 교수 후기 없이도 성립하도록 기능·설계 철학만 사용했다.
