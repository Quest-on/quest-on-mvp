## 2026-08-06

- 코드가 SSOT다. 문서·스펙·플랜은 SSOT가 아니다. 둘이 어긋나면 코드가 맞고 문서를 고친다.
- 추적 사슬의 종착점은 문서가 아니라 테스트다. 인수 조건은 통과/실패가 찍히는 테스트로 착지시키고, 스펙 문서는 "왜 그렇게 정했나"의 기록으로만 둔다.
- `docs/specs/` 산출물은 작성 시점의 결정 기록이다. 살아있는 계약처럼 취급하지 않는다. 구현이 끝나면 스펙을 고치려 들지 말고 코드와 테스트를 근거로 삼는다.

## 2026-07-08

- Before any update or merge work, explicitly confirm the current branch is not `main`, and create or rename a task branch before touching files when the user is worried about branch safety.

## 2026-03-06

- QA 증상을 제품 정책으로 즉시 해석하지 않는다.
- 먼저 `정책 허용 여부`, `평가 로직`, `UX/렌더링 문제`를 분리해 확인한다.
- 직접 답변 제공처럼 허용된 동작은 차단하지 말고, 평가 근거와 회복 여부를 구조화해서 반영한다.
- 사용자가 `Mermaid만` 원하면 문서형 설명보다 다이어그램 파일과 렌더 산출물을 우선 만든다.
- 구조 리뷰 요청도 사용자가 다이어그램 중심을 명시하면 `섹션별 .mmd + 렌더 검증` 형태로 제공한다.

## 2026-05-18

- 사용자가 단순화를 요청한 폼 UI에서는 내부적으로 자동 생성되거나 완료 후에만 필요한 값(예: 접속 코드)을 작성 중 화면에 노출하지 않는다.
- 참고 UI가 넓은 여백과 독립 질문 블록을 쓰는 경우, fieldset/legend처럼 전체 섹션을 테두리로 감싸는 패턴을 피하고 실제 입력 컨트롤에만 경계를 둔다.

## 2026-05-20

- 루브릭·자동 서술형 채점을 제거할 때 DB 컬럼(`exams.rubric`)은 보존하고 런타임·출제 UI·프롬프트만 끊는다. 기존 데이터 무손실.
- 제출 시 자동 채점은 `multiple-choice`/`true-false`만 큐잉하고, essay/case는 인스트럭터 `case-grade/chat` → `case-grade/commit` 경로로만 `grades`에 기록한다.
- 시험 대시보드 집계는 무거운 analytics overview 대신 `GET /api/exam/[examId]/student-summaries` 한 엔드포인트로 MCQ/OX/서술 진행률을 계산한다.
- 시험 채팅/답안 요약은 **제출 시 QStash phase**에서만 생성한다. `case-grade/commit`에서 `triggerExamSummariesAfterCaseCommit` 같은 재생성을 붙이지 않는다.
- 문항별 요약 placeholder는 `grade_type: "ai_summary"`로 저장해 `overallScore`·`isCaseGraded`에 영향을 주지 않게 한다.
- 강사 채점 UI: 세션 요약은 케이스 문항 사이드에서만, 문항별 카드는 `caseCount >= 2`일 때만.

## 2026-05-24 — Claude Harness v2 리팩토링

- 계층형 CLAUDE.md 도입: 영역별 규칙은 하위 디렉토리(`app/api/`, `components/`, `prisma/`) CLAUDE.md에 두어 자동 로드되게 함. 루트는 공통 원칙만.
- DB는 Prisma 클라이언트가 아닌 Supabase JS(`getSupabaseServer()`) 사용 — 과거 문서가 잘못 안내했음. `database/NNN_*.sql`이 DDL의 source of truth, `prisma/schema.prisma`는 introspection용.
- Skill/Command 구분: Skill은 description 매칭으로 자동 호출, Command는 사용자가 `/`로 명시 호출. qa-* 9종은 진입 비용 때문에 사장됐던 자산 — Skill 3개(api-route, data-flow-audit, test-author)로 압축.
- 자가 진화는 화이트리스트 파일만 (`tasks/lessons.md`, `.claude/CHANGELOG.md`). 소스 코드 자동 commit 절대 금지, push도 절대 금지.

## 2026-05-27 — PR #17 채점 UX 정책

- 강사 case/essay 채점 진입은 시험 종료 후(`exam.status === "closed"`)에만 허용한다. 대시보드 CTA는 종료된 시험에서 제출 학생 중 미채점 case/essay가 있을 때만 보인다.
- MCQ/OX는 AI/grade row를 쓰지 않고 학생의 raw selected answer와 `correctOptionIndex`만으로 정오답과 점수를 계산한다.
- `grade_type: "ai_summary"`는 요약 placeholder일 뿐이므로 점수, 진행률, 채점 완료 여부, 재채점 스킵 조건에 포함하지 않는다.
- 대시보드 최종 점수는 시험 종료 후에만 노출하고, 개별 채점 화면에서는 종료 후 문항별/문제별 점수를 볼 수 있게 한다.
- 문항 deep link는 배열 위치가 아니라 명시적 `qIdx`/`question.idx` 기준으로 처리한다. non-contiguous idx를 가정하고 API와 UI를 함께 검증한다.

## 2026-05-28 — 점수 비중 UX

- 문제 유형별 점수 비중은 문항 유형 세트와 항상 동기화한다. 새 유형 추가/기존 유형 제거 시 숨은 빈 값이나 stale weight를 남기지 말고 현재 문항 기준 기본 분배로 즉시 재계산한다.
- 사용자가 특정 유형의 비중을 직접 조정하면 그 값을 고정하고 나머지 유형을 자동 재분배해 합계 100을 유지한다. 합계 오류를 사용자가 직접 맞추게 두지 않는다.
- 점수 비중 UI는 “총 100점 자동 유지”를 보장사항으로 보여주고, 문항 수와 문항당 점수를 함께 노출한다. 사용자가 직접 계산해야 하는 `현재 합계` 중심 UI는 피한다.

## 2026-05-28 — 운영 장애 추적

- 사용자가 다른 도구(예: Claude Code)의 미푸시 작업 가능성을 언급하면 원인 추정 전에 `git status`, `git diff`, 로컬/원격 HEAD를 먼저 확인한다.
- 운영 500은 최근 커밋만 탓하지 말고 배포된 SHA, DB 마이그레이션 상태, 서버 로그, 로컬 미커밋 변경 가능성을 분리해서 본다.

## 2026-05-28 — Case AI 가채점 플로우

- Case AI 일괄 채점 정책은 사용자의 최신 명시가 우선이다. 샘플 인터뷰/캘리브레이션이 아니라 강사의 자연어 기준 또는 “AI한테 다 맡기기”로 바로 전체 CASE 가채점을 실행한다.
- CASE 가채점 입력에는 채점 승인 권한 설정을 함께 둔다. 단, 제안 점수와 최종 확정 저장은 분리해서 강사 확정 전에는 최종 점수로 저장하지 않는다.
- 채점 worker는 `scope`와 `attemptId`를 받아 stale retry, 중복 처리, 샘플/전체 결과 혼입을 방지한다.
- 사용자가 “thinking” 공개를 요청해도 숨은 추론은 공개하지 않는다. 대신 결정 로그, 검증 로그, 에이전트 검토 요약을 제공한다.

## 2026-06-03 — DB 안전 경계

- 사용자가 DB 사고나 데이터 삭제를 언급하면 즉시 모든 DB 연결 작업을 중단한다. E2E, Playwright API, Supabase CLI, Docker Supabase, `prisma db push`, migration 적용, seed/cleanup helper 실행은 명시 재승인 전까지 금지한다.
- 기능 검증이 필요해도 운영/공유 Supabase에 닿을 수 있는 명령은 실행하지 않는다. 로컬 정적 검증(`tsc`, `lint`, pure Vitest)만 사용하고, DB가 필요한 검증은 “미실행”으로 보고한다.
- 테스트/CI 보정 중에도 `.env.local`의 `DATABASE_URL` 또는 Supabase 키를 source해서 실행하지 않는다. DB URL이 로컬 테스트 DB인지 사용자가 확인해주기 전에는 어떤 schema/data 명령도 금지한다.
- `e2e/helpers/seed.ts::cleanupTestData()`는 `exam_nodes`, `exams` 전체 row를 지울 수 있으므로 절대 수동 실행하지 않는다. 이 helper를 import하는 Playwright/API/E2E 테스트도 DB-backed로 간주하고, `docs/CODEX_DB_SAFETY.md`의 preflight 없이 실행하지 않는다.
- Codex 세션에서 검증 계획을 세울 때 DB-backed 테스트는 기본 제외한다. 허용 기본값은 `npx tsc --noEmit`, `npm run lint`, DB helper를 import하지 않는 pure Vitest, `git diff --check`뿐이다.

## 2026-06-14 — Change-impact 리뷰 & 코딩 구독 키

> 이 절의 대상이던 CI AI 리뷰 봇(impact-review)은 2026-08-18에 제거됐다. 남긴 이유는 다시 만들 때 같은 벽에 부딪히지 않기 위해서다.

- 한쪽 구현만 고치고 거울 짝(예: instructor new↔edit, assignment new↔edit)을 안 고치는 drift는 **복붙이라 import edge가 없어** 의존성 그래프로 못 잡는다. 가드는 `__tests__/mirror-drift.test.ts`(공용 헬퍼 import 강제)와 `ARCHITECTURE.md`의 거울 쌍 표로 둔다.
- **"for coding" 구독 키(Kimi for Coding, GLM Coding Plan)는 raw API(SDK/curl/CI 스크립트)로 못 쓴다.** 엔드포인트가 클라이언트 화이트리스트(Claude Code/opencode/Cline/Kimi CLI 등)를 강제하고 비대화형 배치 호출을 금지한다. User-Agent 위조는 계정 정지 사유 → 금지.
- 구독 키를 합법적으로 쓰려면 **화이트리스트 코딩 CLI를 헤드리스로 경유**한다(예: GLM Coding Plan + `opencode run` + `OPENCODE_CONFIG`). raw API가 필요하면 *일반 종량제* 키(`api.moonshot.ai/v1` / `api.z.ai/api/paas/v4`)를 따로 발급해야 한다. coding 엔드포인트는 `.../coding/...` 경로로 구분된다.
- coding 구독은 인터랙티브 quota와 같은 통을 쓰므로 **CI 자동 실행은 quota를 잠식하고 ToS 회색지대다.** 봇을 걷어낸 이유 중 하나.
- 자동 게이트는 **고신뢰·무오탐만**(거울 Vitest 테스트 + tsc/lint). 단순 의미 판단은 정규식 룰로 박지 않는다(오탐). **사고 이력이 있는 핵심 불변식(qIdx 등)은 결정적 Vitest 회귀 테스트로 박는다**(아래 실측 참조). 구조 경계가 정말 아프면 ast-grep/dependency-cruiser 같은 표준 도구.
- **리뷰 에이전트에 라이브 DB 권한 금지**(read-only라도). CI에 DB 크레덴셜=PII 유출 위험 + 6/03 DB 성역 위반. 데이터모델 영향은 `database/NNN_*.sql`·`prisma/schema.prisma`를 *파일로 read*해서 판단한다.
- coding 구독(GLM/Kimi) 모델 id는 빨리 낡는다(glm-4.7→5.1→5.2). 모델 id를 코드에 박으면 유지비가 계속 든다.
- **[실측] AI 리뷰 레인은 *미묘한 실제 회귀*를 놓친다.** 실제 사고(commit e4ae062: 채점 페이지 q_idx 매핑)를 되돌린 diff를 GLM-5.2 2레인에 라이브로 먹였더니 "0 findings"로 통과시킴(뻔한 합성 케이스는 잡음). diff만 보면 `submissions?.[qIdx]`가 멀쩡해 보이고 "저장은 배열위치 키잉" 맥락을 알아야만 버그라서. → **사고 낸 적 있는 핵심 불변식은 AI에 맡기지 말고 결정적 Vitest 회귀 테스트로 박는다**(`__tests__/qidx-grade-mapping.test.ts`: 채점 페이지가 resolveByQIdx 폴백 쓰는지 검사). 정규식 룰은 빼되(오탐), 그 자리에 *정밀 테스트*를 넣어야지 AI-only로 두면 커버리지 회귀. → 결국 이 실측이 봇 제거의 근거가 됐다: 잡아야 할 것은 못 잡고 quota·유지비·머지 지연(관측 9~31분)만 남았다.
## 2026-08-12 — staging DB rollout

- 사용자가 “staging에 반영”과 migration 실행을 명시하면 코드·Vercel 배포만 완료로 보고하지 않는다. staging 대상과 승인 파일을 검증해 DDL → dry-run → rollout mode → 기존 사용자 user-flow QA까지 닫고, 불가능한 단계만 즉시 구체적으로 보고한다.

## 2026-08-16 — UX 군더더기와 증거 위장

- 사용자가 같은 지적을 두 번 했다. "클릭을 3번이나 해야하는 UIUX"(채점 비중 슬라이더), "이런 구질구질한 설명들은 그냥 다 지워줘"(과목 선택). → **값을 정하지 않는 순수 UI 개폐(스위치·토글·"조정" 버튼)와 제목을 되풀이하는 설명은 만들지 않는다.** 라벨 옆 `선택` 배지가 이미 말하는 걸 헬퍼·빈 상태 제목·빈 상태 설명이 세 번 더 반복하고 있었다. 정보와 군더더기는 구분한다 — "업로드하면 AI가 자료를 근거로 문제를 만듭니다"처럼 읽어야 아는 사실은 남긴다.

- **오류를 빈 상태로 위장하지 않는다.** `useQuery`에서 `isLoading`만 꺼내 쓰면 실패 시 `data`가 기본값 `[]`로 떨어져 "폴더 없음"/"응시한 시험이 없습니다"/"시험이 없습니다"가 뜬다. 시험 플랫폼에서 이건 "내 데이터가 사라졌다"로 읽힌다. 6곳을 고쳤다(#240·#242·#243·#244·#245). 단 **오류는 보여줄 게 없을 때만** 낸다 — React Query는 재조회 실패 후에도 이전 `data`를 들고 있으므로 `isError && !hasResults`로 좁힌다. 가진 목록을 오류로 덮으면 사용자가 더 잃는다.

- **문자열 검사만으로 UI 수정을 확인하지 않는다.** `drive.noExams`만 검사하고 통과시켰는데 실제 화면에 뜬 건 `drive.empty`였다. 스크린샷을 안 봤으면 못 잡았다. 또 `textContent`는 `<script>` 안의 RSC 페이로드까지 읽고, 인증 리다이렉트된 빈 페이지에서도 "제거됨"이 나온다. **양성 대조(그 화면에만 있는 문구가 실제로 렌더됐는지)를 먼저 걸고 나서 부재를 주장한다.**

- **종결 게이트의 critic 필드를 손으로 채우지 않는다.** 비평가를 실행하지 않고 `criticReview: OKAY`를 직접 썼고, `sourceHash`를 64-hex가 아닌 설명 문자열로 기입했다. 테스트에서 가짜 증거를 다섯 번 걷어내놓고 게이트에서 같은 짓을 했다. 비평가 9명이 순차 감사해 7번 REJECT를 받고서야 닫혔다. → critic 판정은 **실제 위임 후 그 verdict를 옮겨 적는다.** `sourceHash`는 canonical diff 명령을 명시하고 재계산 원시 출력을 durable artifact로 남긴다. 공격 벡터는 서술이 아니라 **재현 가능한 스크립트**와 원시 실패 출력으로 남긴다.

- 로컬 `npm run lint`가 `.gjc/`에 `.cjs` 하나 생겼다고 통째로 죽는다. `eslint-config-next`의 react 블록이 `**/*.{js,jsx,mjs,ts,tsx,mts,cts}`에만 적용되는데 `.cjs`가 빠져 있고, 우리 rules 블록은 파일 제한이 없다. `.gjc/`는 gitignore라 CI는 멀쩡해서 **PR에 쓴 "lint 0 errors"가 로컬에선 거짓이었다**(#239에서 ignores에 추가).

- 로컬 dev 확인은 `127.0.0.1` 말고 **`localhost`**로 연다. Next 가 `/_next/*` 를 교차출처로 막아 하이드레이션이 통째로 죽는다(`Blocked cross-origin request to Next.js dev resource`). 프로덕션 빌드(`next start`)는 `NODE_ENV=production`이라 테스트 바이패스가 원천 차단(`TEST_BYPASS_SECRET must not be set in a deployed environment`)되므로 인증 화면 확인에 못 쓴다.
- 검증용 dev 서버는 `npm run dev:verify` 로 띄운다. `next dev` 는 인라인 env 를 덮지는 않지만 **설정하지 않은 키는 `.env.local` 에서 주입한다** — 실제로 `VERCEL_OIDC_TOKEN` 1193자가 검증 서버에 들어갔다. `AGENTS.md` 의 ".env.local 을 검증에 로드하지 않는다" 는 기억이 아니라 스크립트로 지킨다.
- CI 재실행이 필요하면 `gh run rerun` 이나 빈 커밋을 쓴다. `git push --force origin/staging:refs/heads/<브랜치>` 는 그 브랜치의 작업을 덮고 PR 을 자동으로 닫는다.
