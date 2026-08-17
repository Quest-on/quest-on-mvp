# Testing Conventions

## Test Types

| Type          | Tool       | Location             | Scope                                                        | CI 필수 게이트 |
|---------------|------------|----------------------|--------------------------------------------------------------|----------------|
| Unit          | Vitest     | `__tests__/`         | Business logic, utilities, Zod schemas                       | ✅ |
| API           | Playwright | `e2e/api/`           | Integration tests against mock server                        | ✅ |
| Browser smoke | Playwright | `e2e/browser/`       | 페이지 진입, 인증 가드, a11y, CSP, error boundary            | ✅ |
| Browser flows | Playwright | `e2e/browser/flows/` | 시험 생성·응시·채점 전체 시나리오 (Page Object 기반)          | ❌ (로컬/수동) |

### browser flows 가 CI 에 없는 이유

flows 는 `data-testid` 와 클릭 순서에 물려 있어서 UI 를 건드릴 때마다 깨진다.
머지를 막는 게이트로 두면 "테스트가 깨졌으니 테스트를 지운다"로 가기 때문에, CI 게이트에서 빼고
**UI 를 바꾼 PR 에서는 작성자가 로컬로 직접 돌린다**로 규칙을 옮겼다.

flows 를 지우지는 않는다. Page Object 12개가 자산이고, 릴리즈 전 수동 QA 에서 그대로 쓴다.

---

## Rules

- When adding a new API route: add at minimum a unit test for the Zod schema and an integration test.
- When fixing a bug: add a regression test that reproduces the bug first, then fix it.
- Do not mark work complete without running the relevant test suite.
- **UI(컴포넌트·페이지)를 바꾼 PR 은 머지 전에 `npm run test:browser` 를 로컬에서 한 번 돌린다.**
  깨진 flows 를 발견하면 같은 PR 에서 고친다.

---

## Commands

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Unit tests
npm run test

# API 통합 테스트 (CI 와 동일) — 먼저 scripts/setup-test-db.sh 를 돌린다
npm run test:api

# 브라우저 뼈대 테스트 (CI 와 동일)
npm run test:e2e

# 브라우저 전체 — flows 포함. UI 변경 PR 은 이걸 돌린다
npm run test:browser
```

> DB 를 건드리는 테스트는 반드시 `docs/CODEX_DB_SAFETY.md` 를 먼저 읽는다.
> `.env.local` 을 테스트에 물리지 않는다.

## 로컬 DB 준비

`test:api` 와 `test:e2e` 는 로컬 Supabase 가 있어야 돌아간다. Docker 가 필요하다.

```bash
bash scripts/setup-test-db.sh
```

끝나면 CI 와 같은 상태가 된다 — API 통합 381개, 브라우저 E2E 40개 전부 통과.

스키마만 올리면 대부분 죽는다. 다음 네 가지가 함께 있어야 한다.

- **비-Prisma 테이블** — `profiles`, `instructor_profiles`, `paste_logs`, `error_logs`.
  `profiles` 를 만든 뒤 017·018·019·021 을 다시 돌려야 `plan` 컬럼이 생긴다.
  `admit_exam_session` 이 그 컬럼을 읽는다.
- **API 롤 권한** — Prisma 가 `postgres` 롤로 테이블을 만들어서
  `anon`/`authenticated`/`service_role` 에 권한이 없다. 없으면 전부
  `permission denied` 로 죽는다.
- **보안 하드닝** — 위 blanket GRANT 는 경계까지 열어버린다. `028` 을 다시 돌려
  `service_role` 도 `ai_config_*` 를 직접 못 쓰게 되돌린다(RPC 만이 쓰기 경로).
  안 되돌리면 보안 경계 테스트가 실패한다.
- **온보딩 시드** — 없으면 브라우저 E2E 가 전부 `/onboarding` 으로 튕긴다.
  동의 주체는 `subject_ref = 'v1:' + HMAC-SHA256(user_id)` 이고,
  **테스트 바이패스 경로는 userId 로 리터럴 `"test-bypass"` 를 넘긴다**
  (`proxy.ts`). 쿠키의 사용자 id 가 아니다. 둘 다 시드해야 한다.
