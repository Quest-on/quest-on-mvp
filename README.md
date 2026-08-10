# Quest-On

AI 기반 시험/과제 플랫폼. 교수자가 출제 → 학생이 AI 대화로 응시 → AI 채점 → 교수자 검수.

## 기술 스택

| 영역 | 사용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript (strict) |
| 스타일 | Tailwind CSS 4, shadcn/ui, Base UI |
| 인증 | **Supabase Auth** (Clerk 은 제거됨) |
| DB | Supabase PostgreSQL + pgvector. 런타임 접근은 `getSupabaseServer()` 만 사용하고, DDL 은 `database/[NNN]_*.sql` 이 원천이다. `prisma/schema.prisma` 는 introspection 전용이며 런타임에 import 하지 않는다 |
| 서버 상태 | TanStack Query (`components/providers/QueryProvider.tsx`, 키는 `lib/query-keys.ts`) |
| AI | OpenAI API. 모든 호출은 `lib/ai-tracking.ts` 를 거쳐 `ai_events` 에 기록된다 |
| 레이트리밋 | Upstash Redis |
| i18n | next-intl |
| 호스팅 | Vercel (staging / production 프로젝트 분리) |

## 시작하기

```bash
git clone https://github.com/Quest-on/quest-on-mvp.git
cd quest-on-mvp
npm install          # postinstall 이 .githooks 를 연결한다 (main/staging 직접 커밋 차단)
```

환경변수는 `.env.example` 을 복사해 `.env.local` 로 만든다. 필요한 키의 정의는 `lib/env-manifest.ts` 가 원천이고, 검증은 아래로 한다.

```bash
npm run env:check
npm run dev          # http://localhost:3000
```

> ⚠️ `.env.local` 이 운영 DB 를 가리키면 로컬에서 앱을 켜는 것만으로 실제 사용자 데이터가 바뀐다. 본인용 개발 DB 접속 정보를 받아서 쓴다. 자세한 규칙은 `docs/CODEX_DB_SAFETY.md`.

## 디렉터리

```
app/
  (app)/        instructor, student, exam, assignment, onboarding, settings, profile, join
  (auth)/       sign-in, sign-up
  auth/         OAuth 콜백
  admin/        관리자 화면
  api/          Route Handler (69개)
components/     UI. 도메인별 하위 디렉터리 + ui/ 프리미티브
lib/            비즈니스 로직, Supabase/OpenAI 래퍼, 쿼리 키, env 매니페스트
database/       DDL (NNN_ 접두사 순서대로 적용)
prisma/         introspection 결과 스키마 (런타임 미사용)
e2e/            Playwright (api-integration / browser-e2e / browser-flows)
messages/       next-intl 번역
docs/           운영·보안·테스트·스테이징 문서
```

## 검증

```bash
npx tsc --noEmit && npm run lint
npm run test                 # vitest
npm run test:api             # Playwright API 통합
npm run test:e2e             # Playwright 브라우저
```

DB 를 건드리는 테스트는 **폐기 가능한 로컬 DB** 에서만 돌린다. `.env.local` 을 테스트에 로드하지 않는다. 상세는 `docs/TESTING.md`.

## 기여

브랜치·PR·리뷰 절차는 `CONTRIBUTING.md`, 추적 규칙은 `docs/WORKFLOW.md`.
작업 PR 의 base 는 `main` 이 아니라 **`staging`** 이다.

## 에이전트로 작업할 때

**`AGENTS.md` 가 이 저장소의 단일 계약이다.** Claude Code(`CLAUDE.md` → `@AGENTS.md`), Codex, Cursor 모두 같은 파일을 읽는다. 도구별로 규칙을 갈라 쓰지 않는다.
디렉터리별 세부 규칙은 `app/api/CLAUDE.md`, `components/CLAUDE.md`, `prisma/CLAUDE.md` 에 있다.

**코드가 SSOT다.** 이 README 를 포함해 어떤 문서도 진실의 원천이 아니다. 문서와 코드가 어긋나면 코드가 맞고, 문서를 고친다.
