# PR #78 and #88+ Integration Design

## Goal

Review every pull request in scope, integrate only the non-obsolete changes on an isolated branch, promote the verified result through `staging` to `main`, and confirm that Vercel deploys the exact production commit.

## Scope and disposition

| PR | Disposition | Reason |
|---|---|---|
| #78 | Integrate with reconciliation | Workflow assets are useful, but `AGENTS.md` conflicts with the staging workflow and `pr-hygiene` must cover staging and stacked PRs. |
| #88 | Integrate after fail-fast reconciliation, without applying DDL | Schema and helpers are additive, but the SQL runner and file need atomic failure behavior. No database command or production migration is authorized in this task. |
| #89 | Integrate before #100/#102 and align retained manual flow tests | It is the shared base for both security PRs. Three old role-screen expectations conflict with intentional role skipping, and the mocked submit flow must mock the newly required profile PATCH. |
| #90 | Integrate after repairing its broken pure test | Product code matches the intended conditional disclosure; the source-inspection helper is what fails. |
| #92 | Integrate | It keeps the retained manual browser-flow asset aligned with the product selector. |
| #94 | Already included | Merged into `staging` as `c27e98ff`. |
| #98 | Integrate | Security correction; must receive fresh CI in the combined branch. |
| #100 | Integrate after #89 | Uses `lib/safe-redirect.ts` introduced by #89. |
| #102 | Integrate after #89 | Uses the same safe redirect boundary. |
| #103 | Skip as obsolete | Closed intentionally because #94 superseded its workflow approach; CODEOWNERS was deferred to separate work. |
| #104 | Already included | Current `staging` head `778df020`. |
| #105 | Integrate first | Replaces the fake green build with an actual build and is already fully green. |

## Considered approaches

1. Merge each PR directly to `main`. Rejected because partial production deployments would occur before the combined state is verified.
2. Rebase or update every contributor branch onto `staging`. Rejected because it mutates shared branches and repeats the same conflict resolution several times.
3. Merge the exact PR heads into one isolated integration branch from current `staging`, preserving ancestry, then promote that tested snapshot. Chosen because the operation is recoverable, auditable, and exposes one combined diff to CI and final review.

## Integration architecture

The controller owns sequencing, task boundaries, every GitHub/Vercel action, and final acceptance. One scoped implementer subagent at a time may write and commit only its assigned integration task in the isolated worktree; reviewer subagents are read-only. No subagent may mutate GitHub, a database, or Vercel.

The integration branch starts at `origin/staging`. It preserves each included PR head through merge commits in this order:

1. #105
2. #78
3. #88
4. #89
5. #100
6. #102
7. #98
8. #92
9. #90

#94 and #104 are already ancestors of the branch. #103 is recorded as intentionally skipped.

## Conflict policy

- `AGENTS.md`: retain #78's concise repository-specific rules, update the stack to Supabase Auth, and retain #94's two-stage `staging` workflow and DB stop-ship rule.
- `.gitignore`: keep the union of staging runtime directories and contributor QA-artifact directories; also ignore `.worktrees/`.
- `.github/workflows/pr-hygiene.yml`: run for every pull request, including stacked PRs, rather than only `main` targets.
- `docs/WORKFLOW.md`: name the actual checks and state that Browser E2E is the stable smoke set; retained `browser-flows` remain manual QA assets.
- Missing `docs/CODEX_DB_SAFETY.md`: create the referenced stop-ship document so repository instructions are executable rather than a dead link.
- #88 migration safety: add an explicit transaction and make the CI `psql` invocation stop on the first SQL error; production DDL remains a separate, unauthorized operation.
- #89 retained browser flow: update the already-role-resolved student expectations and mock `/api/user/profile` PATCH consistently with the existing mocked profile APIs.
- #90 test: replace the `)}\n` source heuristic with a check scoped to the complete disclosure block.

## Safety conditions

- No local command may connect to Supabase/Postgres, apply DDL, run Prisma schema operations, seed or clean data, or run Playwright/API E2E.
- `.env.local` is never loaded. The untracked `.claude/worktrees/` and `.hermes/` directories remain untouched.
- `main` is not updated until the combined branch has fresh local static evidence, a clean final review, and green GitHub CI with an actual Build step.
- GitHub merges use the expected head SHA so a moved branch cannot be merged accidentally.
- A failed test, unresolved Critical/Important finding, remote branch race, or failed production deployment stops promotion.

## Goal, completion, and verification gates

Goal is met when every in-scope PR has an explicit disposition and every included head is represented in the integration history or already in `staging`.

Integration is complete when:

- no unmerged files or unexpected paths remain;
- TypeScript, lint, pure Vitest, YAML parsing, and `git diff --check` pass;
- a final independent reviewer reports no unresolved Critical/Important issue;
- the integration PR is merged into `staging` with the reviewed head SHA;
- a `staging` to `main` promotion PR is merged with the expected staging SHA.

Deployment is verified only when Vercel reports a production deployment with `meta.githubCommitSha` equal to the final remote `main` SHA and state `READY`. A production deployment in `BLOCKED`, `ERROR`, or a different SHA is not completion.

## Rollback

Before the final `main` merge, rollback is abandoning the integration branch. After production promotion, rollback is a normal revert of the promotion merge or Vercel rollback to the previously verified production deployment `dpl_3kHY4pyap7Hugry3JZDD1jWVxwDt`; no force-push or database rollback is part of this task.
