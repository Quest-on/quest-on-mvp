# PR #78 and #88+ Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the reviewed, non-obsolete contents of PR #78 and every PR numbered #88 or later into a verified production `main` commit and confirm the matching Vercel deployment is READY.

**Architecture:** Build one audit branch from current `origin/staging`, preserve included PR heads with merge commits, and make only the minimum reconciliation changes needed for combined correctness. Promote the exact reviewed snapshot through GitHub PRs from integration to `staging` and from `staging` to `main`.

**Tech Stack:** Git/GitHub, Next.js 16, TypeScript, Vitest, GitHub Actions, Vercel Git integration.

## Global Constraints

- The controller owns sequencing and every GitHub/Vercel action. At most one scoped implementer subagent may write or commit in the isolated worktree at a time; reviewer subagents are read-only.
- Never load `.env.local` or run Supabase, Postgres, Prisma, migration, seed, cleanup, Playwright, or DB-backed API/E2E commands.
- Preserve user-owned untracked paths and unrelated worktrees.
- Do not force-push any shared branch.
- Do not update `main` until all local gates, final review, and GitHub CI gates are green.
- A Vercel result is complete only when target is `production`, state is `READY`, and commit SHA equals remote `main`.

---

### Task 1: Record the baseline and control artifacts

**Files:**
- Create: `docs/superpowers/specs/2026-08-08-pr78-plus-integration-design.md`
- Create: `docs/superpowers/plans/2026-08-08-pr78-plus-integration.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `origin/main=bc251dcdcd7eb5d7ea43e67a8d258a903ddfad3a`, `origin/staging=778df020f4b0eda906fa8a9bd14754de121a07bd`.
- Produces: isolated branch `chore/pr78-plus-integration` and the binding disposition table.

- [x] **Step 1: Verify isolated branch and author**

Run: `git status --short --branch && git config user.name && git config user.email`

Expected: branch is `chore/pr78-plus-integration`; author is `Justin Cho <35755925+jcmaker@users.noreply.github.com>`.

- [x] **Step 2: Verify planning diff**

Run: `git diff --check && git diff -- .gitignore docs/superpowers`

Expected: no whitespace error and only the three intended paths.

- [x] **Step 3: Commit control artifacts**

```bash
git add .gitignore docs/superpowers/specs/2026-08-08-pr78-plus-integration-design.md docs/superpowers/plans/2026-08-08-pr78-plus-integration.md
git commit -m "docs: add PR integration safety plan"
```

### Task 2: Establish honest CI and merge workflow assets

**Files:**
- Merge: PR #105 head `a7c35ce746a9b2740747d40486da719b62f06f1c`
- Merge: PR #78 head `15c571971ab235dc4a3d7b32af38ebf9c31d8458`
- Modify: `AGENTS.md`
- Modify: `.github/workflows/pr-hygiene.yml`
- Modify: `docs/WORKFLOW.md`
- Create: `docs/CODEX_DB_SAFETY.md`

**Interfaces:**
- Consumes: #104's smoke-only browser gate and #105's dummy-env real Build step.
- Produces: workflow policy that applies to `staging`, stacked PRs, and production promotion.

- [ ] **Step 1: Merge #105 with an explicit merge commit**

Run: `git merge --no-ff --no-edit origin/chore/ci-honest-build`

Expected: clean merge modifying only `.github/workflows/ci.yml`.

- [ ] **Step 2: Merge #78 and stop at its expected conflict**

Run: `git merge --no-ff --no-edit origin/chore/agentic-workflow-templates`

Expected: only `AGENTS.md` is unresolved.

- [ ] **Step 3: Resolve repository policy**

Use #78's concise file as the base, but set the work base and PR base to `staging`, forbid direct work on both `main` and `staging`, describe Supabase Auth rather than Clerk, and keep the DB stop-ship rules. Remove the `main` base filter from `pr-hygiene`, document the actual checks, and add `docs/CODEX_DB_SAFETY.md` with the binding local-only database rules.

- [ ] **Step 4: Verify and commit the merge resolution**

Run: `git diff --name-only --diff-filter=U && git diff --check && rg -n 'branches: \[main\]' .github/workflows/pr-hygiene.yml`

Expected: no unresolved file, no whitespace error, and no `main`-only hygiene filter.

Commit: `git add AGENTS.md .github docs scripts tasks CLAUDE.md && git commit --no-edit`

### Task 3: Merge the additive activation schema without touching a database

**Files:**
- Merge: PR #88 head `d75ebd8118e9030ad0d06c457f871ac91319ce7d`
- Modify: `database/018_onboarding_activation.sql`
- Modify: `.github/actions/test-setup/action.yml`
- Create: `__tests__/onboarding-migration-safety.test.ts`
- Inspect: `lib/onboarding-events.ts`
- Inspect: `lib/plan-limits.ts`
- Inspect: `prisma/schema.prisma`

**Interfaces:**
- Consumes: existing Supabase runtime conventions.
- Produces: additive DDL and pure helpers, with no applied migration.

- [ ] **Step 1: Merge #88**

Run: `git merge --no-ff --no-edit origin/feat/onboarding-activation-schema`

Expected: clean merge.

- [ ] **Step 2: Run pure checks only**

Add `BEGIN`/`COMMIT` around migration 018 and `-v ON_ERROR_STOP=1` to its test-setup `psql` invocation. Add one source-level Vitest check that fails if either guard is removed.

Run: `/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/vitest run __tests__/plan-limits.test.ts __tests__/onboarding-events.test.ts __tests__/onboarding-migration-safety.test.ts`

Expected: all three files pass. Do not run `prisma validate` or apply `database/018_onboarding_activation.sql`.

- [ ] **Step 3: Commit the migration safety reconciliation**

Commit: `git add database/018_onboarding_activation.sql .github/actions/test-setup/action.yml __tests__/onboarding-migration-safety.test.ts && git commit -m "fix(ci): make onboarding migration fail atomically"`

### Task 4: Merge onboarding and its security children

**Files:**
- Merge: PR #89 head `1cde991a11ee410f95dab16d8c49dd14c42cb15d`
- Merge: PR #100 head `234cdf8f30559f326793d633df0dd9cd5325e408`
- Merge: PR #102 head `11702439988d3f80a56a08a6f353a4ecb709efa1`
- Modify: `.gitignore` only for union conflict resolution
- Inspect: `app/(app)/onboarding/page.tsx`
- Inspect: `app/auth/callback/route.ts`
- Inspect: `components/agent/AgentRunController.tsx`
- Inspect: `lib/safe-redirect.ts`
- Inspect: `lib/agent/navigate-guard.ts`
- Modify: `e2e/browser/flows/onboarding-flow.spec.ts`

**Interfaces:**
- Consumes: #89's `safeInternalPath()`.
- Produces: conditional onboarding role resolution plus guarded OAuth and agent navigation.

- [ ] **Step 1: Merge #89 and resolve `.gitignore` as a union**

Run: `git merge --no-ff --no-edit origin/feat/onboarding-role-and-profile-dedup`

Expected: only `.gitignore` conflicts; preserve `.orca/`, `.redteam/`, and `.worktrees/` rules, then finish the merge commit.

- [ ] **Step 2: Merge the two child PRs**

Run in order:

```bash
git merge --no-ff --no-edit origin/fix/auth-callback-open-redirect
git merge --no-ff --no-edit origin/fix/agent-navigate-route-guard
```

Expected: both clean because #89 is already an ancestor.

- [ ] **Step 3: Run the security and onboarding pure tests**

Update the retained browser-flow file so the existing `studentPage` fixture expects the profile form after its known role is resolved. Extend its existing profile API mock to return 200 for `PATCH /api/user/profile`; do not run Playwright locally.

Run:

```bash
/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/vitest run __tests__/onboarding-profile.test.ts __tests__/onboarding-page-wiring.test.ts __tests__/profile-setup-redirect.test.ts __tests__/safe-redirect.test.ts __tests__/auth-callback-redirect.test.ts __tests__/auth-callback-route.test.ts __tests__/agent-navigate-guard.test.ts __tests__/agent-navigate-wiring.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 4: Commit the retained-flow reconciliation**

Run: `/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/tsc --noEmit && git diff --check`

Expected: TypeScript succeeds and the diff is clean.

Commit: `git add e2e/browser/flows/onboarding-flow.spec.ts && git commit -m "test(onboarding): align retained flow with role skip"`

### Task 5: Merge CORS, retained browser selector, and AI disclosure

**Files:**
- Merge: PR #98 head `6ba50abdf209529fb57c87aee3599f1899a73fd0`
- Merge: PR #92 head `846385c691451431b4b8b7d36a94787ecfd562cf`
- Merge: PR #90 head `4100d608aecfc835017fbacde0d1d01570ca3c6a`
- Modify: `.gitignore` only for union conflict resolution
- Modify: `__tests__/preflight-disclosure-wiring.test.ts`

**Interfaces:**
- Consumes: #94's environment model and #104's retained manual browser-flow policy.
- Produces: owned-origin CORS defaults, stable retained flow selector, and conditionally displayed AI disclosure.

- [ ] **Step 1: Merge #98 and #92**

```bash
git merge --no-ff --no-edit origin/fix/cors-default-origins
git merge --no-ff --no-edit origin/fix/e2e-bulk-grade-send-stale-label
```

Expected: clean merges.

- [ ] **Step 2: Merge #90 and resolve `.gitignore` as a union**

Run: `git merge --no-ff --no-edit origin/feat/student-ai-disclosure`

Expected: only `.gitignore` conflicts; preserve the same union as Task 4.

- [ ] **Step 3: Repair the broken pure test**

Replace `isGated()`'s first-`)}\n` heuristic with an assertion scoped to the full AI disclosure JSX block so nested translation expressions do not look like the gate terminator.

- [ ] **Step 4: Run focused pure tests and commit the test repair**

Run:

```bash
/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/vitest run __tests__/cors.test.ts __tests__/student-disclosure.test.ts __tests__/preflight-disclosure-wiring.test.ts __tests__/grading-helpers.test.ts
git diff --check
```

Expected: all listed tests pass and no whitespace error.

Commit: `git add __tests__/preflight-disclosure-wiring.test.ts && git commit -m "test(exam): fix disclosure gate assertion"`

### Task 6: Verify the complete branch and obtain independent approval

**Files:**
- Inspect: every path in `origin/staging...HEAD`
- Record: subagent review reports in the plan-specific SDD workspace

**Interfaces:**
- Consumes: completed merge history and reconciliation commit.
- Produces: fresh local evidence and clean final review.

- [ ] **Step 1: Verify PR ancestry and skipped disposition**

Run `git merge-base --is-ancestor` for #78, #88, #89, #90, #92, #98, #100, #102, and #105 heads. Confirm #94/#104 are ancestors of the original staging base. Record #103 as intentionally skipped.

- [ ] **Step 2: Run full DB-free local gates**

```bash
git diff --check origin/staging...HEAD
/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/tsc --noEmit
/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/eslint .
/Users/justin/workspace/startup/quest-on-mvp/node_modules/.bin/vitest run
```

Expected: zero TypeScript errors, zero lint errors, and zero failed Vitest tests. Existing lint warnings are reported, not hidden.

- [ ] **Step 3: Validate workflow YAML**

Run:

```bash
NODE_PATH=/Users/justin/workspace/startup/quest-on-mvp/node_modules node -e "const fs=require('fs'),yaml=require('js-yaml'); const files=[...fs.readdirSync('.github/workflows').filter(x=>x.endsWith('.yml')).map(x=>'.github/workflows/'+x),'.github/labels.yml',...fs.readdirSync('.github/ISSUE_TEMPLATE').filter(x=>x.endsWith('.yml')).map(x=>'.github/ISSUE_TEMPLATE/'+x)]; for(const file of files) yaml.load(fs.readFileSync(file,'utf8')); console.log(files.length+' YAML files parsed')"
```

Expected: every file parses.

- [ ] **Step 4: Dispatch final code review**

Provide the full `origin/staging...HEAD` review package and this plan to an independent reviewer. Any Critical or Important finding blocks publication until fixed and re-reviewed.

### Task 7: Publish the integration PR and merge it into staging

**Files:**
- No additional source changes.

**Interfaces:**
- Consumes: reviewed local branch head.
- Produces: merged GitHub integration PR with the same expected head SHA.

- [ ] **Step 1: Push the integration branch**

Run: `git push -u origin chore/pr78-plus-integration`

Expected: the remote branch head equals local HEAD.

- [ ] **Step 2: Create a ready PR to staging**

Create a GitHub PR with base `staging`, head `chore/pr78-plus-integration`, the disposition table, conflict resolutions, test evidence, and explicit statement that DB migration was not applied.

- [ ] **Step 3: Wait for all GitHub checks**

Require success for `Lint & Type Check`, actual `Build`, `Unit Tests`, `API Integration Tests`, `Browser E2E Tests`, `impact-review`, and `pr-hygiene`. Inspect the Build steps to ensure `next build` executed.

- [ ] **Step 4: Merge with expected head SHA**

Merge the PR into `staging` with a merge commit and the expected integration head SHA. Re-fetch and verify remote `staging` contains every included head.

### Task 8: Promote staging to main and verify production

**Files:**
- No source changes after staging approval.

**Interfaces:**
- Consumes: exact verified remote `staging` SHA.
- Produces: remote `main` and Vercel production deployment for the same SHA.

- [ ] **Step 1: Create and validate the promotion PR**

Create a GitHub PR from `staging` to `main`. Require the same GitHub checks and verify no new diff beyond the tested staging snapshot.

- [ ] **Step 2: Merge with expected staging SHA**

Use a merge commit and `expected_head_sha=<verified staging SHA>`. Re-fetch and verify `origin/main` is the returned merge SHA.

- [ ] **Step 3: Verify individual PR outcomes**

Confirm #78, #88, #89, #90, #92, #98, #100, #102, and #105 are merged or their exact heads are ancestors of `main`. Retarget stacked #100/#102 to `staging` if GitHub needs that ancestry to recognize the merge. Leave #103 closed with its obsolete disposition.

- [ ] **Step 4: Verify Vercel production deployment**

Poll Vercel project `prj_cj6CI1UpERJSzNsOmOFa7eKxrPoS` in team `team_mHYRYgdTMkUbIFacaxz1lzuZ` until the deployment for remote `main` has target `production` and state `READY`. Verify its `githubCommitSha` equals remote `main`, inspect build logs if not READY, and scan recent runtime error clusters before reporting completion.
