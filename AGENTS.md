## 협업 규칙 (필독 — 모든 도구·모든 작업자 공통)

> 이 저장소는 포크 기반 협업을 사용한다. `main` 은 메인테이너(@jcmaker)만 머지한다.
> **AI 코딩 도구(Cursor / Claude Code / Codex)로 작업할 때, 아래 절차를 먼저 수행한 뒤 코드를 건드린다.**

1. **`main` 에서 직접 작업/커밋/푸시 금지.** (git hook 이 차단한다. 자세한 워크플로: `CONTRIBUTING.md`)
2. **작업 시작 전 항상 최신 main 으로 동기화한다:**
   ```bash
   git checkout main
   git fetch upstream
   git reset --hard upstream/main
   ```
3. **새 작업 브랜치를 만들고 거기서만 작업한다:**
   ```bash
   git checkout -b feat/<짧은-설명>     # 종류: feat / fix / docs / chore
   ```
4. **커밋은 작게, 자주.** 한 브랜치 = 한 가지 변경. 끝나면 **자기 포크로 push** 후 **Pull Request** 를 안내한다.
   ```bash
   git push -u origin feat/<짧은-설명>
   ```
5. **머지 후 충돌이 나면**, PR 작성자가 자기 브랜치에서 해결한다:
   ```bash
   git fetch upstream && git rebase upstream/main && git push --force-with-lease
   ```
6. **`.env*` 등 비밀정보는 절대 커밋하지 않는다.** 운영 DB 접속정보로 로컬을 돌리지 않는다(아래 DB Safety).

작업자가 이 절차를 모르면, **에이전트가 대신 위 명령을 수행**하고 사람에게는 무엇을 했는지 한국어로 짧게 설명한다.

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## DB Safety — Stop-Ship Rule

- Before running any command that can touch Supabase, Prisma, Playwright E2E/API tests, seed helpers, cleanup helpers, Docker DB containers, `psql`, or migrations, read `docs/CODEX_DB_SAFETY.md`.
- Never run DB-backed E2E/API tests or `e2e/helpers/seed.ts::cleanupTestData()` unless the user explicitly confirms a disposable local DB and the exact DB URL is localhost/127.0.0.1.
- Never source `.env.local` for test or verification commands. If `.env.test` is missing or does not point to localhost, stop and ask.
- If the user reports data loss or DB damage, immediately stop all DB-related commands and inspect only local files/git history until the user explicitly approves a next step.
