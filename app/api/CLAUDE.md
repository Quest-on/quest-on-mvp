# API Routes — Conventions

## Scope
Applies to all route handlers under `app/api/`. For broader product rules see root `CLAUDE.md`; for security depth see `docs/SECURITY.md`; for grading worker specifics see `docs/GRADING_PIPELINE_RUNBOOK.md`.

## Route Order
1. CORS preflight (OPTIONS) — only if cross-origin
2. Rate limit — `checkRateLimitAsync(key, RATE_LIMITS.x)`
3. Auth — `currentUser()` / `requireAdmin()` / `verifySignatureAppRouter()` (QStash) / bearer
4. Input validation — Zod schema, return 400 on failure
5. Ownership check — match `user.id` against resource's owner column
6. Business logic — via `lib/` helpers and `getSupabaseServer()`
7. AI event tracking — only if OpenAI was called (use `callTrackedChatCompletion` / `callTrackedOpenAI`)
8. Return response — `successJson()` / `errorJson()`

Webhook, cron, and `/api/internal/*` routes substitute step 3 with signature verification. See SECURITY.md.

## Rate Limiting
Import from `@/lib/rate-limit`. Always async (Upstash-backed with in-memory fallback). Key format: `"<route-slug>:<user.id-or-ip>"`. Predefined buckets: `chat`, `ai`, `general`, `upload`, `sessionRead`, `examControl`, `submission`, `adminLogin`, `pasteLog`, `finalAnswerSave`, `publicSearch`.

```ts
const rl = await checkRateLimitAsync(`exam-start:${user.id}`, RATE_LIMITS.examControl);
if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);
```

## Auth
- **Student/instructor**: `const user = await currentUser();` from `@/lib/get-current-user`. Returns `null` if unauthenticated.
- **Admin**: `const denied = await requireAdmin(); if (denied) return denied;` from `@/lib/admin-auth`.
- **QStash webhook**: wrap handler — `export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY ? verifySignatureAppRouter(handler) : handler;`
- **Role check after auth**: `if (user.role !== "instructor") return errorJson("FORBIDDEN", "...", 403);`

## Input Validation (Zod)
Define schema at module scope, parse with `safeParse`. Never trust `request.json()` directly.

```ts
const PatchSchema = z.object({ role: z.enum(["instructor", "student"]).optional() });
const parsed = PatchSchema.safeParse(await request.json());
if (!parsed.success) return errorJson("INVALID_INPUT", "Invalid input", 400);
```

For UUID path params use `validateUUID(id, "examId")` from `@/lib/validate-params`.

## Ownership Check
Always verify the authed user owns (or has access to) the resource before mutating. Example: instructor mutating an exam.

```ts
const { data: exam } = await supabase.from("exams").select("instructor_id").eq("id", examId).single();
if (!exam) return errorJson("NOT_FOUND", "Exam not found", 404);
if (exam.instructor_id !== user.id) return errorJson("FORBIDDEN", "Access denied", 403);
```

## AI Event Tracking
Never call `openai.*` directly in a route — use the tracked wrappers in `@/lib/ai-tracking`:
- `callTrackedChatCompletion(...)` — Chat Completions
- `callTrackedOpenAI(fn, context, options)` — Responses API, embeddings, anything else

These insert into `ai_events` (tokens, latency, cost in micros, request/response IDs, pricing_version, config_version) on every call — success or failure.

**재시도·타임아웃은 SDK 요청 옵션 한 층만 소유한다 (이슈 #118).** 래퍼는 동시성 제한과 지연 측정만 한다. 호출부가 직접 넘긴다:

```ts
client.chat.completions.create(params, { timeout, maxRetries, signal })
```

클라이언트 기본 `maxRetries` 는 0 으로 닫혀 있다(숨은 재시도 방지). 재시도가 필요하면 **호출부에서 명시**해야 한다. 래퍼에 다시 루프를 만들면 SDK 재시도와 곱해진다 — 그게 27배 증폭 결함이었다.

**스트리밍 경로**는 thunk 래퍼를 쓸 수 없다. `lib/ai-tracking.ts` 의 `recordAiStreamEvent` 를 종료 경로에서 **정확히 한 번** 부른다(settled 플래그로 보호). 네 경로를 모두 덮어야 한다: 정상 완료 / 완료 이벤트 없이 종료 / 예외 / 클라이언트 취소. `ReadableStream.cancel` 에서 SDK 스트림을 abort 하지 않으면 아무도 읽지 않는 응답에 계속 과금된다. 참고 구현: `app/api/assignment-chat/route.ts`.

## Error Response Convention
Use helpers from `@/lib/api-response`:
- `successJson(data?, statusOrOptions?)` → `{ success: true, ...data }`
- `errorJson(code, message, status, details?)` → `{ error, message, details? }`

Status codes: 400 bad input · 401 unauth · 403 forbidden · 404 not found · 409 conflict · 429 rate-limited · 500 internal. Never leak stack traces; log details via `logError(message, err, { path, additionalData })` from `@/lib/logger`.

## Quick Examples
- Good standard handler: `app/api/user/profile/route.ts` (auth → rate-limit → Zod → update → successJson)
- Good ownership + atomic transition: `app/api/exam/[examId]/start/route.ts`
- Good signature-verified worker: `app/api/internal/grading-worker/route.ts`
- Streaming reference (exactly-once event + cancel bridge): `app/api/assignment-chat/route.ts`
