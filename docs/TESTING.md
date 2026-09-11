# Testing Conventions

## Test Types

| Type          | Tool       | Location             | Scope                                                        | CI 필수 게이트 |
|---------------|------------|----------------------|--------------------------------------------------------------|----------------|
| Unit          | Vitest     | `__tests__/`         | Business logic, utilities, Zod schemas                       | ✅ |
| API           | Playwright | `e2e/api/`           | Integration tests against mock server                        | ✅ |
| Browser smoke | Playwright | `e2e/browser/`       | 페이지 진입, 인증 가드, a11y, CSP, error boundary            | ✅ |
| Browser flows | Playwright | `e2e/browser/flows/` | 시험 생성·응시·채점 전체 시나리오 (Page Object 기반)          | 동의 온보딩 flow 만 ✅ |

### browser flows 가 대부분 CI 게이트에 없는 이유

flows 는 `data-testid` 와 클릭 순서에 물려 있어서 UI 를 건드릴 때마다 깨진다.
머지를 막는 게이트로 두면 "테스트가 깨졌으니 테스트를 지운다"로 간다. 그래서 사고 이력이 있는
`consent-onboarding-flow` 하나만 CI 잡(`consent-flow-test`)으로 남기고 나머지는 뺐다.

flows 를 지우지는 않는다. Page Object 12개가 자산이다.

---

## Rules

- When adding a new API route: add at minimum a unit test for the Zod schema and an integration test.
- When fixing a bug: add a regression test that reproduces the bug first, then fix it.
- Do not mark work complete without running the relevant test suite.
- **UI(컴포넌트·페이지)를 바꾼 PR 은 머지 뒤 staging 배포에서 직접 눌러 본다.** 로컬에 브라우저
  테스트 스택을 세우지 않는다.

---

## Commands

로컬에서 돌리는 것은 이 셋뿐이다.

```bash
npx tsc --noEmit
npm run lint
npm run test          # vitest
```

## DB 붙는 테스트는 CI 가 돌린다

`test:api`·`test:e2e`·`test:browser` 는 로컬 Supabase 스택(Docker)을 요구한다. 그 스택을 세우고
살려 두는 비용이 얻는 신호보다 커서 **로컬 실행을 규칙에서 뺐다.** PR 을 올리면 CI 가 같은 것을
전부 돌린다(`.github/workflows/ci.yml`). 결과는 Actions 로그와 `playwright-report-*` 아티팩트로 본다.

로컬 재현이 정말 필요하면 정본은 `.github/actions/test-setup/action.yml` 이다. 무엇을 어떤 순서로
올려야 테스트가 도는지(비-Prisma 테이블 → API 롤 권한 → 보안 하드닝 재적용)가 주석과 함께 있다.
문서로 옮겨 적지 않는다 — 갈라지면 문서가 거짓말을 한다.

> DB 를 건드리는 명령은 `docs/CODEX_DB_SAFETY.md` 를 먼저 읽는다.
> `.env.local` 을 테스트에 물리지 않는다.

## 동작 확인은 staging 에서 한다

`staging` 에 머지되면 CI 가 전부 초록일 때 자동 배포된다(`ci.yml` 의 `deploy-staging` 잡).
확인은 **https://quest-on-staging-two.vercel.app** 에서 한다.

- `quest-on-staging.vercel.app` 과 `staging.quest-on.app` 은 쓰지 않는다. 전자는 Clerk 시대 배포가
  남은 것이고 후자는 404 다. 거기서 확인하면 없는 버그를 본다.
- 배포 도착 확인: `curl https://quest-on-staging-two.vercel.app/api/health`
- 환경 구분·배포 후 점검 절차는 `docs/STAGING.md`.
