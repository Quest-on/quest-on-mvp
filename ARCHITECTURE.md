# Quest-On System Architecture

> Last audited: 2026-03-25

## 1. System Overview

Quest-On is an AI-powered exam and assignment platform where instructors create assessments, students take them with AI tutoring support, and instructors grade case questions with AI-assisted chat after submission.

**Core Flow:** Instructor creates exam → uploads materials → AI generates questions → Students join via code → AI tutors during exam → Students submit → MCQ/OX auto-graded → Instructor grades case questions via AI chat → adjusts scores

**Stack:** Next.js 16 (App Router) | React 19 | TypeScript 5 | Tailwind 4 | Supabase Auth | Supabase PostgreSQL + pgvector | OpenAI API | Upstash Redis | Vercel (iad1)

> 런타임 DB 접근은 `getSupabaseServer()` 하나뿐이다. **Prisma 는 런타임에 쓰지 않는다** — `prisma/schema.prisma` 는 introspection 결과이고, DDL 의 원천은 `database/[NNN]_*.sql` 이다.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  Instructor Dashboard  │  Student Exam UI  │  Admin Panel    │
└────────────┬────────────────────┬──────────────┬─────────────┘
             │                    │              │
             ▼                    ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS APP ROUTER                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 32 Pages │  │ 69 API   │  │ Server   │  │ 인증은 라우트│  │
│  │ (SSR/CSR)│  │ Routes   │  │ Actions  │  │ 핸들러에서  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└───┬──────────────┬──────────────┬──────────────┬────────────┘
    │              │              │              │
    ▼              ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐
│Supabase│  │ Supabase │  │ OpenAI   │  │ Upstash Redis  │
│ Auth   │  │ Postgres │  │ API      │  │ Rate Limiting  │
│        │  │ + Storage│  │ gpt-5.6  │  │                │
│        │  │ + Vector │  │ 계열     │  │                │
└────────┘  └──────────┘  └──────────┘  └────────────────┘
```

---

## 3. Third-Party Integrations

| Service | Purpose | Auth Mechanism | Env Vars |
|---------|---------|---------------|----------|
| **Supabase Auth** | User auth (OAuth/email), session cookies, role metadata | Anon key (client) + Service role key (server) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Supabase** | PostgreSQL database, file storage, realtime subscriptions, pgvector | Anon key (client) + Service role key (server) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |
| **OpenAI** | Chat tutoring, objective auto-grading, case grading chat, question generation, summarization | API key | `OPENAI_API_KEY` |
| **Upstash Redis** | Distributed rate limiting across serverless instances | REST URL + Token | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **Vercel** | Hosting, serverless functions, analytics | Platform-managed | `VERCEL_URL` |

---

## 4. Authentication & Authorization

**Provider:** Supabase Auth (OAuth + email). Clerk 은 제거됐다 — `@clerk/*` 의존성은 `package.json` 에 없다. 마이그레이션 흔적은 `scripts/migrate-clerk-users.ts` 뿐이다.

**Roles:**
- **Student** — take exams, chat with AI tutor, view reports
- **Instructor** — create/manage exams, upload materials, review grades
- **Admin** — separate JWT-based auth (`lib/admin-auth.ts`), system logs, AI usage analytics

**Auth Flow:**
1. Supabase Auth 가 `/(auth)/sign-in`, `/(auth)/sign-up` 에서 로그인/가입을 처리하고, OAuth 는 `/auth/callback` 으로 돌아온다
2. 신규 사용자 → `/onboarding` 에서 역할 선택. **라우팅 권위는 `profiles.role`** 이다 (`lib/supabase-auth.ts`). auth `user_metadata.role` 은 가입 시점 힌트이며 권위가 아니다 (`lib/onboarding-role.ts`)
3. 역할 기반 리다이렉트는 `lib/get-current-user.ts` (→ `lib/supabase-auth.ts` 의 `currentUser()` 재수출)
4. API routes call `currentUser()` → returns null if unauthenticated
5. Instructor layout enforces role check in `app/(app)/instructor/layout.tsx`

**Admin Auth:** Separate system at `/admin/login` using username/password → HMAC-SHA256 signed JWT → httpOnly cookie (24h expiry). Uses timing-safe comparison.

**Test Bypass:** `lib/get-current-user.ts` allows header-based auth bypass when `TEST_BYPASS_SECRET` is set. Hard-blocked in production (`NODE_ENV === "production"` throws).

---

## 5. Rate Limiting

Defined in `lib/rate-limit.ts`. Uses Upstash Redis (distributed) with in-memory fallback.

| Endpoint | Limit | Window |
|----------|-------|--------|
| Chat (`/api/chat`) | 30 req | 1 min |
| Admin login (`/api/admin/auth`) | 5 req | 1 min |
| AI endpoints (`/api/ai/*`) | 20 req | 1 min |
| Upload (`/api/upload`) | 10 req | 1 min |
| Submission | 30 req | 1 min |

---

## 6. Page Routes (32)

### Public / Auth
| Route | Purpose |
|-------|---------|
| `/` | Landing page / role-based redirect |
| `/(auth)/sign-in` | 로그인 |
| `/(auth)/sign-up` | 가입 |
| `/auth/callback` | OAuth 콜백 |
| `/legal/privacy` | Privacy policy |
| `/legal/terms` | Terms of service |
| `/legal/security` | Security policy |
| `/legal/cookies` | Cookie policy |

### Student
| Route | Purpose |
|-------|---------|
| `/student` | Student dashboard |
| `/student/profile-setup` | Student onboarding |
| `/student/report/[sessionId]` | Session feedback report |
| `/exam/[code]` | Exam waiting room / join |
| `/exam/[code]/answer` | Active exam — answer questions |
| `/assignment/[code]` | Assignment submission |
| `/profile` | Student profile |

### Instructor
| Route | Purpose |
|-------|---------|
| `/instructor` | Instructor dashboard |
| `/instructor/new` | Create new exam |
| `/instructor/[examId]` | Exam detail / monitoring |
| `/instructor/[examId]/edit` | Edit exam |
| `/instructor/[examId]/grade/[studentId]` | Grade student |
| `/instructor/[examId]/grade/[studentId]/re` | Re-grade |
| `/instructor/assignment/new` | Create assignment |
| `/instructor/assignment/[assignmentId]` | Assignment detail |
| `/instructor/assignment/[assignmentId]/grade/[sessionId]` | Grade assignment |

### Admin
| Route | Purpose |
|-------|---------|
| `/admin` | Admin dashboard |
| `/admin/login` | Admin login |
| `/admin/logs` | System logs |
| `/admin/ai-usage` | AI cost/token analytics |

### Other
| Route | Purpose |
|-------|---------|
| `/onboarding` | Role selection (new users) |
| `/join` | Join exam via code |

---

## 7. API Routes (69)

### AI / Generation
| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| POST | `/api/ai/generate-questions` | Generate exam questions from materials | default |
| POST | `/api/ai/generate-questions-stream` | Streaming question generation | default |
| POST | `/api/ai/adjust-question` | Adjust question wording | default |

### Chat / Feedback
| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| POST | `/api/chat` | Student AI tutor chat during exam | 60s |
| POST | `/api/feedback-chat` | Post-exam feedback chat | default |
| POST | `/api/assignment-chat` | Assignment-specific AI chat | default |
| POST | `/api/instructor/chat` | Instructor AI assistant | default |
| POST | `/api/feedback` | Generate session feedback report | 300s |

### Exam Management
| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| POST | `/api/exam/[examId]/start` | Start exam (open for students) | default |
| POST | `/api/exam/[examId]/end` | End exam | default |
| POST | `/api/exam/[examId]/late-entry` | Allow late student entry | default |
| GET | `/api/exam/[examId]/sessions` | Get all student sessions for exam | default |
| GET | `/api/exam/[examId]/final-grades` | Final grades for exam | default |
| GET | `/api/exam/[examId]/live-messages` | SSE stream of live messages | default |

### Session / Submission
| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| GET | `/api/session/[sessionId]` | Get session data | default |
| POST | `/api/session/[sessionId]/preflight` | Preflight checks before exam start | default |
| PUT | `/api/session/[sessionId]/grade` | Trigger/update grading | default |
| GET | `/api/session/[sessionId]/live-messages` | Live message stream for session | default |

### Student
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/student/profile` | Get student profile |
| GET | `/api/student/sessions` | Get student's sessions |
| GET | `/api/student/sessions/stats` | Session statistics |
| GET | `/api/student/session/[sessionId]/report` | Session report data |

### File / Materials
| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| POST | `/api/upload` | File upload | 60s |
| POST | `/api/upload/signed-url` | Generate signed upload URL | 30s |
| POST | `/api/extract-text` | Extract text from PDF/DOCX | 120s |
| POST | `/api/embed` | Generate embeddings for materials | 30s |
| POST | `/api/search-materials` | RAG search exam materials | default |
| POST | `/api/internal/process-rag` | Full RAG pipeline processing | 300s |

### Admin
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/auth` | Admin login |
| GET | `/api/admin/logs` | System logs |
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/[userId]` | Update user |
| GET | `/api/admin/ai-usage/summary` | AI cost summary |
| GET | `/api/admin/ai-usage/breakdown` | Token/cost breakdown |
| GET | `/api/admin/ai-usage/events` | Paginated AI event logs |

### Analytics
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/analytics/exam/[examId]/overview` | Exam analytics overview |

### Other
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/supa` | Multi-handler (exam, drive, session, submission, assignment) |
| POST | `/api/auth/revoke-other-sessions` | 현재 세션을 제외한 나머지 Supabase 세션 폐기 |
| POST | `/api/log/paste` | Paste detection logging |
| GET | `/api/universities/search` | University search |
| GET | `/api/health` | Health check |

---

## 8. Database Schema (10 Models)

**Provider:** Supabase PostgreSQL via Prisma ORM | **Extensions:** pgvector (1536-dim embeddings)

### Entity Relationship

```
exam_nodes ──┐
             ├──▶ exams ◀── exam_material_chunks (RAG)
             │      │
             │      ▼
             │   sessions ──┬──▶ submissions
             │      │       ├──▶ grades
             │      │       ├──▶ messages
             │      │       └──▶ ai_events
             │      │
             │      └──────────▶ ai_events (also links to exams)
             │
student_profiles (Supabase auth user id 로 연결)
questions (legacy — data now in exams.questions JSON)
```

### Models

| Model | Key Fields | Unique Constraints | Notes |
|-------|-----------|-------------------|-------|
| **exams** | id, title, code, status, instructor_id, questions (JSON), type (exam\|assignment), rag_status | code | Gate fields: open_at, close_at, started_at |
| **exam_nodes** | id, instructor_id, parent_id, kind, name, sort_order, exam_id | — | Self-referential tree (folders/sections), RLS enabled |
| **sessions** | id, exam_id, student_id, status, device_fingerprint, last_heartbeat_at | [exam_id, student_id] | Status: not_joined → joined → waiting → in_progress → submitted/auto_submitted/locked |
| **submissions** | id, session_id, q_idx, answer, edit_count, answer_history (JSON) | [session_id, q_idx] | Compression support |
| **grades** | id, session_id, q_idx, score, comment, grade_type (auto\|manual), stage_grading (JSON) | [session_id, q_idx] | Rubric-based stage grading |
| **messages** | id, session_id, q_idx, role, content, response_id, message_type, tokens_used | — | OpenAI Responses API chaining |
| **ai_events** | id, provider, model, feature, input/output/cached/reasoning tokens, estimated_cost_usd_micros, latency_ms | — | Full AI cost/performance tracking |
| **student_profiles** | id, student_id, name, student_number, school | student_id | Supabase auth user id 로 연결 |
| **questions** | id, exam_id, idx, type, prompt, ai_context | — | Legacy — questions now stored as JSON in exams table |
| **exam_material_chunks** | id, exam_id, file_url, content, embedding (vector 1536) | — | RAG: pgvector embeddings for material search |

### Indexes (40+)
Key performance indexes on: `exams.code`, `exams.instructor_id`, `exams.status`, `sessions.exam_id`, `sessions.student_id`, `sessions.status`, `messages(session_id, q_idx, created_at)`, `ai_events.created_at`, `ai_events.feature`, `ai_events.model`

---

## 9. Data Flow: Key Operations

### Exam Lifecycle
1. **Create:** Instructor creates exam → `POST /api/supa` (exam handler) → inserts `exams` row
2. **Upload Materials:** `POST /api/upload/signed-url` → client uploads to Supabase Storage → `POST /api/extract-text` → `POST /api/internal/process-rag` → chunks + embeddings stored in `exam_material_chunks`
3. **Generate Questions:** `POST /api/ai/generate-questions-stream` → OpenAI → questions stored in `exams.questions` JSON
4. **Start Exam:** `POST /api/exam/[examId]/start` → sets `started_at`, students transition from waiting → in_progress
5. **Student Chat:** `POST /api/chat` → RAG search materials → OpenAI chat completion → message stored in `messages`
6. **Submit:** Student submits → `POST /api/supa` (submission handler) → `submissions` row, session status → submitted
7. **Auto-Grade (objective only):** Submit triggers QStash `grade_question` for MCQ/OX → deterministic `grades` rows (`grade_type: auto`)
8. **Case grading:** Instructor opens grade UI → `POST /api/session/[sessionId]/case-grade/chat` → `POST .../case-grade/commit` → `grades` rows (`grade_type: manual`)
9. **Review:** Instructor dashboard `GET /api/exam/[examId]/student-summaries` shows MCQ/OX/case progress per student

### AI Pipeline
```
User Input → Sanitize → Rate Limit Check → Auth Check → RAG Search (if exam)
→ OpenAI API Call → Track in ai_events → Return Response
```

---

## 10. Security Audit Findings

### CRITICAL

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| C1 | **`.mcp.json` tracked in git** — exposes Supabase project ref | `.mcp.json` (git-tracked) | Attacker can identify your Supabase instance |
| C2 | **`ADMIN_SESSION_SECRET` not configured** — admin auth throws on every call | `lib/admin-auth.ts:9-16`, `.env.local` | Admin dashboard completely broken; `getAdminSecret()` throws |
| C3 | **`INTERNAL_API_SECRET` not configured** — RAG processing rejects all internal calls | `app/api/internal/process-rag/route.ts:10-12` | Material processing pipeline silently fails |

### MEDIUM

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| M1 | **CORS fallback includes localhost** in production | `lib/cors.ts:14-20` | If `ALLOWED_ORIGINS` unset, localhost accepted in prod |
| M2 | **No CSRF protection** on POST/PUT/PATCH/DELETE endpoints | All state-changing API routes | Relies solely on SameSite cookies; forms vulnerable |
| M3 | **CSP allows `unsafe-inline`** for scripts | `next.config.ts` CSP header | XSS attack surface increased. Clerk 제거 후에도 남아 있어 재검토 대상 |
| M4 | **No Next.js middleware.ts** for edge-level auth | Project root | Auth checks happen in individual route handlers, not at the edge |

### LOW

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| L1 | **Input sanitization inconsistent** — not applied to all endpoints | Various API routes vs `lib/sanitize.ts` | Most endpoints use Zod + sanitize, but some skip it |
| L2 | **Rate limiting silent fallback** — no warning when Redis unavailable in prod | `lib/rate-limit.ts` | In-memory fallback doesn't work across Vercel instances |
| L3 | **Single admin account** — no multi-admin or OAuth support | `app/api/admin/auth/route.ts` | Single point of failure for admin access |

### PASSING

| Category | Status | Details |
|----------|--------|---------|
| Secrets in git | PASS | `.env*` excluded by `.gitignore`, never committed |
| API authentication | PASS | All endpoints call `currentUser()` or `requireAdmin()` |
| Ownership verification | PASS | Session/exam ownership checked before data access |
| Input validation | PASS | Zod schemas on most endpoints |
| Security headers | PASS | HSTS (2yr), X-Frame-Options DENY, CSP, Permissions-Policy |
| Timing-safe auth | PASS | `crypto.timingSafeEqual` in admin auth and test bypass |
| Production guards | PASS | `TEST_BYPASS_SECRET` hard-blocked in production |
| File upload validation | PASS | Extension whitelist + MIME type check + size limits |
| AI cost tracking | PASS | Full token/cost/latency tracking in `ai_events` |
| Error handling | PASS | Generic errors in prod, detailed only in development |

---

## 11. Dependency Audit

**76 production deps | 23 dev deps | Package manager: npm**

### Issues

| Package | Issue | Severity |
|---------|-------|----------|
| `@base-ui-components/react@1.0.0-rc.0` | Pre-release (RC) — may have breaking changes on update | Medium |
| `dompurify` + `isomorphic-dompurify` | Dual packages — intentional (SSR compatibility) but adds bundle weight | Low |
| 5 WASM transitive deps (`@emnapi/*`, `@napi-rs/*`, `@tybys/*`) | Extraneous — can be pruned with `npm prune` | Low |
| No Prettier config | Code formatting not enforced — inconsistency risk | Low |

### Clean

- No deprecated packages detected (no moment.js, request, etc.)
- No overlapping functionality (e.g., no competing HTTP clients)
- 76 deps is reasonable for project scope (LMS + AI + rich text + charts)
- Lock file present and consistent
- All major packages on latest versions (React 19, Next.js 16, Tailwind 4)

---

## 12. Recommended Remediation Priority

### Immediate (Before Next Deploy)
1. **Add `ADMIN_SESSION_SECRET`** to `.env.local` and Vercel env vars (generate with `openssl rand -hex 32`)
2. **Add `INTERNAL_API_SECRET`** to `.env.local` and Vercel env vars (generate with `openssl rand -hex 32`)
3. **Add `.mcp.json` to `.gitignore`** and remove from git tracking (`git rm --cached .mcp.json`)

### Short-Term (This Week)
4. **Fix CORS fallback** — remove localhost origins from production default in `lib/cors.ts`
5. **Add `ALLOWED_ORIGINS`** to Vercel env vars with production domains only
6. **Add Redis fallback warning** — log a warning in `lib/rate-limit.ts` when falling back to in-memory in production
7. **Set `ADMIN_SESSION_SECRET`** in CI/CD secrets (`.github/workflows/ci.yml`)

### Medium-Term (This Month)
8. Add `middleware.ts` for edge-level auth checks (reduces load on individual route handlers)
9. Apply `sanitizeUserInput()` consistently across all endpoints accepting user text
10. Add Prettier config for consistent formatting
11. Consider CSRF tokens for any form-based submissions
