# AGENTS.md

Quest-On: AI 기반 시험/과제 플랫폼. 교수자가 출제 → 학생이 AI 대화로 응시 → AI 채점 → 교수자 검수.
Next.js 16 App Router / React 19 / TS strict / Tailwind 4 / Supabase(Postgres) + Prisma / Clerk / OpenAI / Upstash / Vercel.

## 작업 시작 전

이슈 없이 코드를 만들지 않는다. 이슈 본문이 스펙이고, 모호하면 `status:needs-spec` 으로 두고 멈춘다.

```bash
git fetch origin && git checkout -b feat/<짧은-설명> origin/main   # 종류: feat / fix / docs / chore
```

`main` 에서 직접 작업·커밋·푸시 금지 (git hook 차단). 포크로 작업 중이면 `origin` 대신 `upstream`.
한 브랜치 = 한 이슈 = 한 PR. 커밋 메시지에 `Co-Authored-By` 넣지 않는다.

## 끝내기 전 (필수)

```bash
npx tsc --noEmit && npm run lint
npx vitest run <바꾼 것과 관련된 파일>
```

사람 리뷰어가 없다. PR 본문에 실행한 명령과 실제 출력을 붙인다. "확인했습니다"는 증거가 아니다.
버그 수정은 재현 테스트를 먼저 쓰고 고친다.

## 이 저장소에서 틀리기 쉬운 것

- 런타임 쿼리는 `getSupabaseServer()` (`lib/supabase-server.ts`). 라우트에 raw SQL 금지. DDL 은 `database/[NNN]_*.sql`.
- 서버 입력은 Zod 검증. 인증/서명 검증 **전에** 데이터 접근 금지. 반환·수정 전 소유권 확인.
- 쿼리 키는 `lib/query-keys.ts` 에서 가져온다. 문자열 하드코딩 금지.
- 모든 AI 호출은 `ai_events` 에 기록(토큰·지연·비용).
- 사용자 노출 문구는 next-intl 메시지로. 하드코딩된 한국어/영어 문자열 금지.
- 패키지 추가는 `docs/DEPENDENCY_POLICY.md` 근거 필요.
- `.env*` 커밋 금지.

## DB 안전 — 멈춤 규칙

Supabase / Prisma / Playwright E2E·API 테스트 / seed·cleanup 헬퍼 / `psql` / 마이그레이션을 건드리는 명령은 아래를 만족하지 않으면 실행하지 않는다.
DB 백엔드 테스트와 `e2e/helpers/seed.ts::cleanupTestData()` 는 사용자가 **폐기 가능한 로컬 DB**임을 명시 확인하고 URL 이 localhost/127.0.0.1 일 때만 실행한다.
테스트·검증 명령에 `.env.local` 을 절대 로드하지 않는다. `.env.test` 가 없거나 localhost 가 아니면 멈추고 묻는다.
사용자가 데이터 손실을 보고하면 모든 DB 명령을 즉시 중단하고 로컬 파일·git 기록만 본다.

## 어디를 볼 것인가

| 주제 | 문서 |
|---|---|
| 이슈·PR 추적 규칙, 스프린트 운영 | `docs/WORKFLOW.md` |
| 시스템 전체 지도(라우트·스키마·연동) | `ARCHITECTURE.md` |
| 인증·환경변수·CORS·레이트리밋·입력검증 | `docs/SECURITY.md` |
| 테스트 명령과 기대치 | `docs/TESTING.md` |
| 채점/QStash/스위퍼 | `docs/GRADING_PIPELINE_RUNBOOK.md` |
| 거울 쌍·qIdx·채점 불변식 | `.github/impact-review/rules.md` |
| 제품 판단 기준 | `PRODUCT_PHILOSOPHY.md` |
| 이 프로젝트에서 반복된 실수 | `tasks/lessons.md` |
| 브랜치·PR 상세 절차 | `CONTRIBUTING.md` |

`app/api/`, `components/`, `prisma/` 하위에 영역별 규칙 파일이 있다. 그 디렉터리에서 작업할 때 읽는다.

사용자가 같은 지적을 두 번 하면 `tasks/lessons.md` 에 한 줄 추가한다. 일회성 취향은 넣지 않는다.
