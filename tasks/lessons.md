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
