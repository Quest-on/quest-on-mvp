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

- **발송**은 가입 여부·주소 한도와 무관하게 같은 바이트로 답하고, 실제 발송은 응답 뒤(`after()`)에 한다 — 가입된 주소면 GoTrue 가 요청 안에서 SMTP 를 보내 늦게 돌아오므로, 기다리면 걸린 시간이 가입 여부를 흘린다(계정 열거 차단). 한도는 IP 버킷(`passwordReset`)과 받는 주소 버킷(`passwordResetAddress`, 키는 소문자 주소의 SHA-256 앞 32자 — 저장소에 평문 주소를 남기지 않는다)이 따로 있고, 주소 버킷에 걸리면 429 없이 발송만 건너뛴다. 이 한도는 우리 라우트를 거친 발송만 막는다 — anon 키로 GoTrue `/auth/v1/recover` 를 직접 부르면 Supabase 쪽 한도만 받는다.
- **verify** 만 복구 세션을 만든다. `verifyOtp({ type: "recovery" })` 응답의 세션 `(user_id, session_id)` 에 HMAC(`PASSWORD_RESET_INTENT_SECRET`)을 붙인 의도 쿠키(`HttpOnly`·`SameSite=Strict`·10분)를 심는다. 의도를 못 만들면 세션을 거둔다.
- **화면과 complete** 는 검증된 세션(`getClaims`)이 의도 쿠키의 대상과 같을 때만 연다. 세션이 "있는가" 가 아니라 "복구 링크가 만든 바로 그 세션인가" 를 본다.
- **complete** 는 비밀번호를 바꾼 뒤 모든 세션을 끊고(`signOut({ scope: "global" })`) 의도 쿠키를 지운다.
- **verify·complete** 는 `lib/same-origin.ts` 로 다른 사이트에서 시작된 요청을 거절한다(로그인 CSRF). 두 경로는 `consent-route-policy` 에서 POST 만 공개다.
- 메일 템플릿 링크: `{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`. 발송은 implicit 플로우여야 한다 — PKCE 면 토큰에 `pkce_` 가 붙어 이 해시로 확인되지 않는다. **템플릿을 먼저 바꾸고 배포한다**: 기본 템플릿(`{{ .ConfirmationURL }}`)으로 나간 링크는 GoTrue 가 바로 세션을 만들어 의도 없는 로그인이 된다.
- **토큰이 새는 길**: 확인 화면 주소와 폼에 1회용 토큰이 있다. Referer 는 `strict-origin`(origin 만 — `no-referrer` 는 폼 POST 의 Origin 을 `null` 로 만들어 구형 브라우저의 verify 를 막는다), 세션 리플레이는 폼을 `data-private` 로 통째로 막는다(rrweb 입력 마스킹은 hidden 을 가리지 않는다), Speed Insights 비콘은 `lib/speed-insights.ts` 가 쿼리를 떼고 보낸다. PostHog 이벤트 URL 은 `sanitizeAnalyticsUrl` 이 이미 쿼리를 버린다.
- 매직 링크(`signInWithOtp`)는 쓰지 않는다. GoTrue 는 매직 링크 토큰도 `type: "recovery"` 로 확인해 주므로, 도입하면 로그인 메일이 곧 재설정 링크가 된다.

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
