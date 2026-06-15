# Quest-On Development Guide

## Project Overview

Quest-On is an AI-powered exam/assessment platform. Instructors create exams, students take them with AI tutoring, AI auto-grades, instructors review.

**Stack:** Next.js 16 (App Router) | React 19 | TypeScript 5 (strict) | Tailwind 4 | Prisma + Supabase PostgreSQL | Clerk Auth | OpenAI API | Upstash Redis | Vercel

**Architecture:** See `ARCHITECTURE.md` for full system map (routes, schema, integrations).

Domain-specific rules live in nested `CLAUDE.md` files (`app/api/`, `components/`, `prisma/`). Load them when working in those areas.

---

## Required Reading

| Area | Doc |
|------|-----|
| Auth, env vars, CORS, rate limits, input validation | `docs/SECURITY.md` |
| Test expectations and commands | `docs/TESTING.md` |
| Grading / QStash / sweeper logic | `docs/GRADING_PIPELINE_RUNBOOK.md` |
| Adding or upgrading packages | `docs/DEPENDENCY_POLICY.md` |
| Recurring mistakes in this project | `tasks/lessons.md` |
| Mirror-pair / change-impact review rules (거울 쌍·qIdx·채점 불변식) | `.github/impact-review/rules.md` |

---

## Core Rules

- Do not hardcode secrets. See `docs/SECURITY.md`.
- Do not access data before auth or signature verification.
- Validate server inputs with Zod. Sanitize only HTML-rendered fields.
- Check ownership before returning or mutating resources.
- Use Supabase JS (`getSupabaseServer()` from `lib/supabase-server.ts`) for runtime queries — no raw SQL in routes. DDL goes in `database/[NNN]_*.sql`.
- Track all AI calls in `ai_events` (tokens, latency, cost).
- Use query keys from `lib/query-keys.ts` — never ad-hoc strings.
- Do not add packages without justification (`docs/DEPENDENCY_POLICY.md`).
- Do not mark work complete without running typecheck and lint.

---

## Workflow

### Plan First
Enter plan mode for any task touching 3+ files or requiring architectural decisions. Stop and re-plan if something goes sideways.

### Subagents
For complex tasks, split exploration into isolated subtasks when the tool supports it. Do not spawn agents for simple edits.

### Self-Improvement
When the user corrects a recurring or project-level mistake, propose or add a concise lesson to `tasks/lessons.md`. Do not update it for one-off preferences or temporary corrections.

### Verification
Never mark a task complete without running:
```bash
npx tsc --noEmit
npm run lint
```
Ask yourself: "Would a staff engineer approve this?"

### Bug Fixes
When given a bug report: just fix it. Add a regression test first, then fix the root cause.

---

## Product Philosophy

Follow the principles in `PRODUCT_PHILOSOPHY.md`.

Most important rules:
- Build the smallest useful version first.
- Do not add features without a clear user scenario.
- Prefer simple data models and maintainable code.
- Do not introduce new dependencies without justification.
- Treat user data, error states, and offline states seriously.
