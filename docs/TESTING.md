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

# API 통합 테스트 (CI 와 동일)
npm run test:api

# 브라우저 뼈대 테스트 (CI 와 동일)
npm run test:e2e

# 브라우저 전체 — flows 포함. UI 변경 PR 은 이걸 돌린다
npm run test:browser
```

> DB 를 건드리는 테스트는 반드시 `docs/CODEX_DB_SAFETY.md` 를 먼저 읽는다.
> `.env.local` 을 테스트에 물리지 않는다.
