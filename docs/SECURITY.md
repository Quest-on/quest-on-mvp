# Security Conventions

## Environment Variables

- Local development secrets go in `.env.local`, which must never be committed.
- Production secrets must be configured in the hosting provider's secret/environment manager (Vercel Environment Variables).
- CI secrets must be configured in GitHub Actions secrets (`.github/workflows/ci.yml`).
- When adding new env vars: update all three locations — `.env.local`, Vercel, and CI secrets.
- Server-only secrets must NOT use `NEXT_PUBLIC_` prefix.

환경별 필수/금지 목록의 SSOT 는 `lib/env-manifest.ts` 다. 배포된 환경은 `/api/health`(관리자)로, 파일은 `npm run env:check -- --env <환경> --file <파일>` 로 검증한다.

Required secrets (배포 환경 공통):
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `INTERNAL_API_SECRET`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`

스테이징만: `PASSWORD_RESET_INTENT_SECRET` — 비밀번호 재설정은 지금 스테이징에서만 열려 있다(`lib/password-reset-availability.ts`). 프로덕션을 열 때 프로덕션도 필수가 된다.

Forbidden in deployed environments (프로덕션·스테이징):
`TEST_BYPASS_SECRET`, `NEXT_PUBLIC_TEST_BYPASS_ENABLED` — 존재하면 `lib/supabase-auth.ts` 가 throw 한다. 스테이징 절차는 `docs/STAGING.md`.

---

## Authentication & Authorization

Every **protected user-facing** API route MUST call `currentUser()` (from `lib/get-current-user.ts`) or `requireAdmin()` (from `lib/admin-auth.ts`) before any data access.

Exceptions — these use a different verification method instead:
- **Webhook routes** — verify provider signature
- **Cron/internal routes** — verify `CRON_SECRET` or `INTERNAL_API_SECRET` bearer token
- **QStash worker routes** — verify QStash signing key
- **Public read-only routes** — must explicitly document why auth is not required
- **비밀번호 재설정** (`/api/auth/password-reset`, `…/verify`, `…/complete`) — 비밀번호를 잊은 사람이 쓰므로 로그인을 요구할 수 없다. 대신 아래를 지킨다.

Additional ownership checks:
- Verify `session.student_id === user.id` or `exam.instructor_id === user.id` before returning or mutating resources.
- Instructor-only routes must verify `role === "instructor"` from user metadata.
- Admin routes use separate JWT auth — always call `requireAdmin()` first.

### 비밀번호 재설정 (#318)

동선: 메일 링크 → `/auth/recovery`(확인 화면, 토큰을 쓰지 않음) → 버튼 POST `…/verify` → `/reset-password` → POST `…/complete`.

- **발송**은 가입 여부·주소 한도와 무관하게 같은 바이트로 답한다(계정 열거 차단). 한도는 IP 버킷(`passwordReset`)과 받는 주소 버킷(`passwordResetAddress`, 키는 소문자 주소의 SHA-256 앞 32자 — 저장소에 평문 주소를 남기지 않는다)이 따로 있고, 주소 버킷에 걸리면 429 없이 발송만 건너뛴다.
- **verify** 만 복구 세션을 만든다. `verifyOtp({ type: "recovery" })` 응답의 세션 `(user_id, session_id)` 에 HMAC(`PASSWORD_RESET_INTENT_SECRET`)을 붙인 의도 쿠키(`HttpOnly`·`SameSite=Strict`·10분)를 심는다. 의도를 못 만들면 세션을 거둔다.
- **화면과 complete** 는 검증된 세션(`getClaims`)이 의도 쿠키의 대상과 같을 때만 연다. 세션이 "있는가" 가 아니라 "복구 링크가 만든 바로 그 세션인가" 를 본다.
- **complete** 는 비밀번호를 바꾼 뒤 모든 세션을 끊고(`signOut({ scope: "global" })`) 의도 쿠키를 지운다.
- **verify·complete** 는 `lib/same-origin.ts` 로 다른 사이트에서 시작된 요청을 거절한다(로그인 CSRF). 두 경로는 `consent-route-policy` 에서 POST 만 공개다.
- 메일 템플릿 링크: `{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`. 발송은 implicit 플로우여야 한다 — PKCE 면 토큰에 `pkce_` 가 붙어 이 해시로 확인되지 않는다.

---

## Input Validation

- Validate all user input on the server with Zod schemas before use.
- Validate and escape user-generated HTML before rendering — use `sanitizeUserInput()` from `lib/sanitize.ts` only for fields that are rendered as HTML or have known injection risk.
- Do not mutate plain text input unless the specific field requires normalization (sanitizing free-form answers, markdown, code, or math input may cause data loss).
- File uploads MUST validate: extension (whitelist), MIME type, and file size.
- Never trust client-side validation alone — always re-validate on server.

---

## Rate Limiting

- All public-facing endpoints MUST use rate limiting from `lib/rate-limit.ts`.
- When adding new endpoints, choose the appropriate config and apply it.

| Config     | Limit   |
|------------|---------|
| chat       | 30/min  |
| admin      | 5/min   |
| AI         | 20/min  |
| upload     | 10/min  |
| submission | 30/min  |
| passwordReset (IP) | 3/5min |
| passwordResetAddress (받는 주소) | 3/hour |
| passwordResetVerify (IP, verify·complete) | 10/5min |

전체 목록은 `lib/rate-limit.ts` 의 `RATE_LIMITS` 가 진실이다.

---

## CORS

- CORS rules in `lib/cors.ts` — production origins set via `ALLOWED_ORIGINS` env var.
- Never add `Access-Control-Allow-Origin: *` in production.
- All API routes that accept cross-origin requests must use `getCorsHeaders()` and `handleCorsPreFlight()`.
- Handle OPTIONS preflight before any other logic (rate limit, auth, etc.).
