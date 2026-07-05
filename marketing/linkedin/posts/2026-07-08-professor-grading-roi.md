# Quest-On LinkedIn, 교수 채점 화면 — AI 초안 + 교수 확정 (target 2026-07-08)

> 플레이북: [../PLAYBOOK.md](../PLAYBOOK.md)
> 앵글(이번 주): **소구점 = "4주간 학생·데이터를 증명했으니, 이번엔 교수에게 돌아온 것(채점 ROI + 신뢰)" (BOFU / POV 전환)**. 척추: MOFU 4주(실전·가입·AI 사용 데이터·extra credit 참여) → 교수 채점 화면으로 마이크 이양 → AI가 대신 채점하는 게 아니라 일괄 가채점 초안 + 한 화면 검토 + 교수 확정(`적용/무시`) → Blackbox(답만) vs Glassbox(대화+초안+확정). 6/30 "누가 깊이 팠는지" 씨앗 확장. **채점 시간 %는 실측 전 본문·이미지 모두 금지.**
> 비주얼: 6/24 `_viewer.html` 패턴 fork — 단일 Data Cut 1080×1080 + 제품 UI inset( BulkGradingPanel 스타일, 예시 34/40). PDF 슬라이드 캐러셀 아님(slop 회피).
> 발행 원칙: 개인 계정(영준) 오리지널이 메인, 회사 페이지는 리포스트 보강. 본문 링크 0개(링크는 30초 내 첫 댓글). 해시태그 끝 3개. 화~목 오전 10~12시 KST.

---

## 1. 회사 페이지 (한국어 본문)

4주 동안 우리는 학생 쪽을 보여드렸습니다. 시험이 실제로 돌아가는지, AI를 켜도 안전한지, 안 해도 되는 과제에도 오는지까지요. 이번엔 교수님 채점 화면입니다.

Quest-On에서 시험이 끝나면 교수님은 보통 이렇게 시작합니다. 채점 기준을 한 번 말하거나 적습니다. “논리 40 · 완성도 30 · 개념 30”처럼요. 그러면 CASE AI 가채점이 전원을 한 번에 돌아갑니다. 화면에는 처리 인원이 올라가고, 학생별 제안 점수와 코멘트가 표로 쌓입니다.

여기서 끝이 아닙니다. AI가 점수를 자동으로 저장하지 않습니다. 교수님이 표에서 고치고, 개별 채점 화면으로 들어가 AI 대화 기록과 답안을 같이 본 뒤, “채점 확정”을 눌러야 합니다. 개별 문항에서는 AI 추천 점수가 뜨지만, 적용·무시는 교수님이 고릅니다.

이게 우리가 말하는 Glassbox입니다. 예전엔 최종 답안만 보였습니다. 이제는 학생이 AI와 나눈 대화, AI가 제안한 초안, 교수님이 고친 확정이 한 줄로 이어집니다. extra credit 과제에서 교수님이 “누가 깊이 팠는지 한눈에 보인다”고 하셨던 그 지점이, 채점 화면에서도 같은 방식으로 돌아옵니다.

지난 4주 글에서 이미 보여드린 것과 연결하면 이렇습니다. 학생의 77%는 시험 중 AI를 썼고, “답 대신 써줘”는 1%도 안 됐습니다. 고려대 extra credit에는 예상의 다섯 배가 참여했습니다. 그 데이터가 교수님 책상에 오면, 채점은 답만 읽는 일이 아니라 과정을 검토하는 일에 가까워집니다.

다음 학기 시험·과제 채점을 함께 설계할 교수님과 기관을 찾습니다. 댓글이나 DM으로 편하게 말씀해 주세요.

AI를 허용한 뒤, 교수님 채점 시간의 절반은 어디서 줄일 수 있을까요?

English version & 데모 링크는 첫 댓글에 👇

#에듀테크 #AI평가 #AssessmentTech

---

## 2. 영문 버전 (첫 댓글, LinkedIn 댓글 1,250자 한도 대응)

> 게시 후 30초 이내에 본인이 직접. 링크는 별도 후속 댓글에.

For four weeks we showed the student side: live exams, real AI-usage data, voluntary extra credit turnout. This week is the instructor grading screen.

After an exam ends on Quest-On, the professor sets criteria once — e.g. logic 40, completeness 30, concepts 30. Then CASE AI bulk pre-grading runs across the class. You see progress (e.g. 34/40 processed) and a table of proposed scores and comments per student.

That is not auto-final grading. Nothing is saved until the instructor reviews: edit in the table, open a student to see AI chat logs alongside the answer, then commit. Per question, an AI-suggested score appears — apply or ignore is the instructor's call.

We call this Glassbox. The old model showed only the final answer (blackbox). Now the thread is visible: student–AI dialogue, AI draft, instructor confirmation.

It connects to what we already published: 77% used AI in exams, under 1% asked for full answers; optional extra credit drew ~5× expected turnout. When that data reaches the grading desk, assessment shifts from reading answers to reviewing thinking.

We're looking for professors and institutions to design next semester's exams and grading with us. Comment or DM.

> 해시태그는 댓글에선 SEO 인덱싱 안 되므로 생략(회사 본문에만 유지).

---

## 3. 영준 개인 계정 (오리지널, 1인칭), 메인

4주 동안 저는 학생 쪽만 들여다봤습니다.

가입자 수, 시험 중 AI 질문 로그, extra credit 참여율. 전부 “이게 진짜 되나”를 증명하는 숫자들이었어요. 그런데 파일럿 교수님들한테 물어보면, 학생 이야기 다음에 항상 다른 질문이 나왔습니다. “그래서 채점은요?”

이번엔 그 화면을 보여드리고 싶습니다.

시험이 끝나면 교수님은 Quest-On에서 CASE AI 가채점을 엽니다. 기준을 한 번 말하면 전원이 한 번에 돌아갑니다. 화면에는 “처리 34/40” 같은 진행이 올라가고, 학생별 제안 점수가 표로 쌓입니다. 솔직히 처음 이 플로우를 만들 때, 저는 “과정까지 다 보이면 채점이 더 느려지는 거 아닌가”부터 걱정했습니다. 답안만 읽는 게 제일 빠르니까요.

실제 화면을 다시 열어보니 결이 달랐습니다. AI가 처음부터 끝까지 쓰는 게 아니라, 초안을 잡아주는 쪽에 가깝더군요. 교수님은 표에서 고치고, 필요하면 학생 AI 대화와 답안을 나란히 본 뒤 확정합니다. 개별 문항에 “AI 추천 85점”이 떠도, 적용·무시는 교수님 손에 남아 있습니다. AI가 대신 채점하는 게 아니라, 교수님이 빠르게 확정하는 구조예요.

6/30 고려대 extra credit 글에서 잠깐 썼던 말이 여기서 더 선명해졌습니다. AI를 켜두면 최종 답안은 비슷해지기 쉽고, 남는 건 과정뿐이라는 것. 채점 화면에서 그 “과정”이 로그와 초안·확정으로 이어지면, “누가 깊이 팠는지”가 답안 한 장이 아니라 데이터로 보입니다.

아직 채점 시간을 몇 분 줄였다고 숫자로 말하진 않겠습니다. 실측해서 말할 때까지가 맞다고 봅니다. 대신 지금 확실한 건, 교수님 화면의 주인공이 “답안 더미”가 아니라 “검토할 초안 + 확정 버튼”으로 바뀌었다는 점입니다.

4주간 학생·데이터 이야기를 해왔으니, 이번 주는 교수님 책상 이야기입니다. 다음 학기 채점 화면을 같이 열어보고 싶으시면 DM 주세요.

빌더로 일하다 보면 자꾸 묻게 됩니다. 우리가 줄여야 할 건 교수님의 ‘시간’일까요, 아니면 ‘확신 없이 채점하는 불안’일까요?

#에듀테크 #스타트업 #AI평가

---

## 사진 배치

메인(회사/개인 공통 1차): **단일 Data Cut 1장** — PDF 슬라이드 캐러셀 아님.

- 소스: `assets/2026-07-08/_viewer-grading-roi.html` (#cardA, 1080×1080)
- 출력: `assets/2026-07-08/grading-roi-hero.png` (발행 전 생성)
- 재생성: `node scripts/shoot-linkedin-grading-roi.mjs` (시스템 Chrome + Playwright)
- 구성: KPI 3칸(일괄·초안·확정) + Blackbox/Glassbox 대비 + 제품 UI inset(`CASE AI 가채점`, `처리 34/40`, `채점 확정`) — **예시 화면**, 실명·학교·학생 데이터 없음
- ⚠️ 이미지에 **채점 시간 %·80% 감소** 넣지 말 것(실측 전). 34/40은 UI 예시로만(푸터에 명시).
- 이미지 첨부 시 모바일 "더 보기" 컷오프 짧아짐 → 훅 첫 2~3줄(4주 회고 + 이번엔 교수 화면)이 컷오프 안에 자기완결되는지 세로 모드 확인.

보조(선택): 실제 `BulkGradingPanel` / `grade/[studentId]` Playwright 캡처 1장 — PII 블러 후 Data Cut inset 교체 가능. `scripts/capture-exam-screens.mjs` 확장 또는 `shoot-admin-usercount.mjs` 블러 패턴 참고.

---

## 발행 운영 노트

게시 순서(개인 오리지널 우선, 회사 페이지 보강):
1. D-1: `grading-roi-hero.png` 생성 후 개인 계정 한국어 글을 모바일 세로 모드로 미리보기. 훅 2~3줄이 이미지 첨부 상태에서 "더 보기" 없이 보이는지 확인. 본문 링크 0개 재확인.
2. 발행 시간(KST): 1순위 7/8(화) 또는 7/9(수) 오전 10~11시. 2순위 화~목 오후 1~3시. 주말 회피.
3. 0~30초: 영문 첫 댓글을 본인이 직접(링크는 후속 댓글로 분리 가능).
4. 0~60분 골든아워: 댓글에 15분 이내, 15자+ 답글. 직원 2~3명 60분 내 첫 댓글 시딩(개인 경험/구체 질문 15단어+).
5. 5~30분: 직원 즉시 리포스트(without thoughts) → 회사 페이지가 개인 오리지널 리포스트(보강).
6. D+1 이후: 동일 콘텐츠 24시간 내 재게시 금지.

링크 운영: 본문 링크 0개(세 자산 모두). 링크는 영문 첫 댓글 1개.

---

## 공개 숫자 가드 (defensible / 비공개 구분)

공개해도 되는 것:
- 제품 워크플로우 명칭: `CASE AI 가채점`, `검토 후 확정`, `채점 확정`, `AI 추천 점수 · 적용/무시` — 실제 UI 문자열.
- 시리즈 회고 숫자(이미 공개): 77/23, 답요구 &lt;1%, extra credit 10→50명(다섯 배), 441응시·11시험(6/24) — **한 줄 회고용**, 이번 글 메인 훅 아님.
- 이미지 `34/40`, `85%`, `36개` — **예시 UI** (실DB 아님). 푸터·운영 노트에 명시.

비공개(본문·이미지 금지):
- 채점 시간 절감 %, 80% 감소, “한나절→○분” 등 **실측·교수 동의 전**.
- 비용·마진·AI 단가.
- 학생/교수 실명, 메시지 원문, 개별 점수.
- 고려대/동국대 등 **이번 글에서 새로 학교 실명 추가하지 않음**(6/30 고대는 이미 공개; 이번은 교수 POV 일반화).

---

## 버전 메모

- 회사 글: 4주 MOFU → BOFU(교수 채점) POV 전환. 코어 = 일괄 가채점 초안 + 교수 확정 + Glassbox. “AI가 대신 채점” 명시 반박.
- 영문: 회사 글 transcreate, 1,250자 한도 대응.
- 개인 글: 영준 1인칭. “4주간 학생만 봤다” 고백 → “채점은 더 느려지는 거 아닌가” 걱정 → 화면 열어보니 초안+확정 구조. 6/30 답 수렴/과정 인사이트 1문단 연결. 채점 시간 %는 **의도적 미공개**(정직).
- 비주얼: 6/24 Data Cut 패턴 fork, 슬라이드 캐러셀 대신 **단일 1080 히어로**(slop 회피). `shoot-linkedin-grading-roi.mjs` 추가.
