---
name: test-author
description: Use when writing or modifying tests. Decides Vitest (unit, __tests__/) vs Playwright (E2E, e2e/), applies Quest-On's seed patterns, and enforces no-mock-DB policy. Refers to docs/TESTING.md for full conventions.
---

# Test Author

## When to use
Adding a new test, modifying an existing one, or fixing a flaky test. Bug fix? Write the regression test **first**, then fix the root cause (per root `CLAUDE.md`).

## Decision tree
| Code under test | Tool | Location | Command |
|---|---|---|---|
| Pure function, utility, Zod schema, business logic | Vitest | `__tests__/<name>.test.ts` | `npm run test -- --run` |
| API route end-to-end (auth + DB + response) | Playwright (api project) | `e2e/api/**/<name>.spec.ts` | CI 가 돌린다 (로컬 실행 안 함) |
| Browser interaction, page flow, a11y | Playwright (browser project) | `e2e/browser/**/<name>.spec.ts` | CI 가 돌린다 (로컬 실행 안 함) |

Quick rule: if it touches `request`/`response`/`fetch`, go Playwright. If it's a function you can import and call, go Vitest.

## Mock policy
- **DB: never mock.** Both Vitest and Playwright API tests run against real Supabase (via `getTestSupabase()` in `e2e/helpers/supabase-test-client.ts`). Mocking the DB has historically hidden migration bugs.
- **OpenAI: mock OK.** API tests run against the mock server (`scripts/start-mock-server.ts`, started via `npm run mock-server`). For Vitest, use `vi.mock("@/lib/openai", ...)` or stub `callTrackedResponse`.
- **QStash: mock OK.** Don't enqueue real jobs in tests; assert the publish payload instead.
- **Time: prefer `vi.useFakeTimers()`** for window/expiry tests (see `__tests__/rate-limit.test.ts`).

## Seed patterns (Playwright)
Use the helpers in `e2e/helpers/seed.ts`:

```ts
import { seedExam, seedSession, cleanupTestData } from "../helpers/seed";

test.afterEach(async () => { await cleanupTestData(); });

const exam = await seedExam({ status: "running" });
const session = await seedSession(exam.id, "test-student-id", { status: "in_progress" });
```

For parallel isolation, generate per-test IDs with `createTestContext()` from `e2e/helpers/test-context.ts` instead of the hard-coded `test-instructor-id` / `test-student-id`.

## Auth bypass (Playwright API)
Use the fixtures in `e2e/fixtures/auth.fixture.ts` — they inject `x-test-bypass-token` + `x-test-user-id` + `x-test-user-role` headers, which `lib/supabase-auth.ts#currentUser` recognises only when `TEST_BYPASS_SECRET` is set and `NODE_ENV !== "production"`.

```ts
import { test, expect } from "../fixtures/auth.fixture";

test("...", async ({ studentRequest }) => {
  const res = await studentRequest.post("/api/chat", { data: { ... } });
  expect(res.status()).toBe(200);
});
```

Fixtures: `instructorRequest`, `studentRequest`, `adminRequest` (signs an admin cookie via `ADMIN_SESSION_SECRET`), `anonRequest`.

## Vitest patterns
- Co-locate by domain: `__tests__/grading-helpers.test.ts` for `lib/grading-helpers.ts`. Match filename.
- Avoid top-level `beforeAll` that touches the DB — Vitest tests should be pure-logic.
- Use `describe`/`it` blocks; `expect` from `vitest`.

## Common mistakes
- **Cleanup missing.** API tests without `cleanupTestData()` in `afterEach` poison sibling tests via the shared `test-instructor-id` / `test-student-id` rows.
- **Hard-coded timeouts.** `await page.waitForTimeout(2000)` is flaky. Use `expect(locator).toBeVisible()` polling.
- **Brittle selectors.** Prefer `getByRole`, `getByTestId`, `getByLabel`. Avoid raw CSS selectors that mirror Tailwind classes.
- **Skipping the regression test.** Per root `CLAUDE.md`: bug fix without a failing test first means the bug can silently return.
- **Mocking Supabase.** Don't. Run against the real test DB so migrations are exercised end-to-end.
- **Marking work complete without `npx tsc --noEmit && npm run lint`.** Required by root `CLAUDE.md`.

See `docs/TESTING.md` for the canonical command list.
