# API Conventions

## API Route Structure

Every API route must follow this order. Do not skip steps.

```
0. Handle CORS preflight (OPTIONS) if the route accepts cross-origin requests
1. Apply rate limit (lib/rate-limit.ts)
2. Auth — currentUser() / requireAdmin() / signature / bearer token (see SECURITY.md for exceptions)
3. Input validation (Zod schema)
4. Ownership / authorization check
5. Business logic
6. AI event tracking (only if an OpenAI call was made)
7. Return response with appropriate status code
```

Steps 0 and 2 may vary for webhooks, cron, and internal routes — see `docs/SECURITY.md`.

---

## Error Handling

- Return generic error messages to clients. Never expose stack traces or internal details.
- Use `console.error()` for server-side logging — it is the only allowed console method per ESLint config.
- Detailed error info only in `NODE_ENV === "development"`.
- Always return appropriate HTTP status codes:
  - 400 — bad input
  - 401 — unauthenticated
  - 403 — forbidden (authenticated but not authorized)
  - 404 — not found
  - 429 — rate limited

---

## Database

- Use Prisma client (`lib/prisma.ts`) for all queries — never raw SQL in API routes.
- SQL migrations go in `/database` directory, numbered sequentially.
- Always add appropriate indexes for new query patterns.
- Use cascade deletes for child records (configured in Prisma schema).
- Unique constraints prevent duplicate data (e.g., `[session_id, q_idx]`).

---

## AI Integration

- All OpenAI calls MUST be tracked in the `ai_events` table (tokens, latency, cost, `config_version`).
- Model and request parameters come from the task profile (`resolveAiTaskProfile` in `lib/ai-task-profile.ts`) — never hardcode model names or per-call params in a route.
- **Retry and timeout live in exactly one layer: SDK request options.** Pass them at the callsite as `create(params, { timeout, maxRetries, signal })`. The client default `maxRetries` is pinned to 0, so retries must be explicit. Do NOT add a retry loop around the call — a second layer multiplies with the SDK's own retries (that was the 27× amplification defect in issue #118).
- Long-running routes derive an absolute deadline from `maxDuration` (`lib/ai-deadline.ts`) and let it clamp the effective retry count; if the budget cannot fund one useful attempt, fail before calling OpenAI.
- Streaming routes cannot use the thunk wrapper: call `recordAiStreamEvent` exactly once across all four terminal paths (completed / ended-without-completion / error / client cancel) and bridge cancellation into the SDK stream.
- Rate limit AI endpoints to prevent runaway costs.

---

## State Management (Client)

- Server state: React Query with appropriate `staleTime` (see `components/providers/QueryProvider.tsx`).
- Query keys defined in `lib/query-keys.ts` — always use these, never ad-hoc strings.
- No Redux or Zustand — use React Query for server cache, React state/context for UI state.
- Custom hooks in `/hooks` directory for reusable state patterns.

---

## File Organization

| What              | Where                                    |
|-------------------|------------------------------------------|
| Pages             | `app/(app)/[role]/...` with route groups |
| API routes        | `app/api/[domain]/route.ts`              |
| Components        | `components/[domain]/ComponentName.tsx`  |
| Hooks             | `hooks/use-[name].ts`                    |
| Utilities         | `lib/[name].ts`                          |
| Database migrations | `database/[NNN]_description.sql`       |
