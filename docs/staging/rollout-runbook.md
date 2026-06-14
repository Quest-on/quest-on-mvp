# Quest-On 스테이징 환경 롤아웃 런북 (운영자용)

이 문서는 코드로 자동화할 수 없는 **대시보드/운영자 단계**(G004 prod 스키마 덤프, G007 branch protection, G008 Vercel, G009 staging Supabase)와 그 검증 절차를 담는다. 코드 산출물(G001~G003, G005/G006 스크립트, env-target 가드, secret-scan)은 이미 리포에 반영·검증됨.

> **선행 차단(Phase 0):** 아래 어떤 단계도 시작하기 전에, 노출된 prod service-role/anon JWT + DB 비밀번호를 **반드시 rotation** 한다. 절차: `docs/security/incident-2026-06-prod-key-exposure.md`.

---

## 브랜치 흐름 (확정)
```
feat/*  →(PR)→  develop  →(자동배포)→  staging (Vercel Preview + staging Supabase)
                  │
                  └─ 검토 회의(리드 승인) →(PR)→ main →(배포)→ production
```
- `develop`: 직푸시 자유(보호 없음). staging 자동 배포.
- `main`: 보호(PR 필수 + CI 통과 + 리드 승인 + 직푸시 차단). 리드만 admin 예외.

---

## G009 — 별도 staging Supabase 프로젝트
1. Supabase 대시보드 → New project → name `quest-on-staging`. region 은 prod 와 동일(또는 latency 기준). **ref 가 prod 와 달라야 함.**
2. Settings → API 에서 `Project URL`, `anon key`, `service_role key` 확보 → password manager 저장.
3. Settings → Database 에서 `DATABASE_URL`(pooler) 확보.
4. Auth → URL Configuration:
   - **Site URL**: `<staging-origin>` (G008 에서 확정되는 Vercel develop URL 또는 `https://staging.quest-on.kr`)
   - **Additional Redirect URLs**: `<staging-origin>/auth/callback`, (필요시) `<staging-origin>/**`
5. Auth → Providers → Google: Supabase 가 표시하는 callback `https://<staging-ref>.supabase.co/auth/v1/callback` 을 Google Cloud Console OAuth client 의 Authorized redirect URI 에 추가(staging 전용 client 권장).
6. **prod 프로젝트에는 staging redirect URL 을 추가하지 않는다.**
7. 스키마 적용: G004 베이스라인 적용(아래).
8. 검증(AC-6/AC-8): staging URL 에서 이메일 가입·Google 로그인이 staging callback 으로 귀환, 세션 생성. Supabase 대시보드에서 staging ref 가 prod ref 와 다름 확인.

## G004 — SQL-first 베이스라인 + 적용
1. **prod 스키마 덤프**(데이터 제외):
   ```sh
   pg_dump "$PROD_DATABASE_URL" --schema-only --no-owner --no-privileges \
     --schema=public --schema=auth -f database/000_baseline.sql
   ```
2. **schema-only 기계 검증**(데이터/시크릿 없음):
   ```sh
   ! grep -E "^(INSERT|COPY)\b" database/000_baseline.sql        # 데이터 행 없음
   ! grep -E "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\." database/000_baseline.sql  # JWT 없음
   ! grep -E "@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" database/000_baseline.sql                 # 이메일 없음
   ```
   (auth 스키마 덤프 시 함수/트리거만 포함되도록 `--exclude-table-data='auth.*'` 또는 `auth.users` row 제외 확인.)
3. **순서 manifest**: `database/000_baseline.sql` → 기존 `database/NNN_*.sql`(번호순) → 비번호 legacy → 필요한 `sql/*.sql` 함수/RPC. `CREATE INDEX CONCURRENTLY` 파일은 트랜잭션 밖에서 실행.
4. **새 staging 적용**: `DATABASE_URL=$STAGING_DATABASE_URL` 로 manifest 순서 적용 + `public.queston_migration_ledger`(성공 후 checksum 기록).
5. **기존 prod 채택(adopt)**: historical SQL 을 재실행하지 말고, expected objects/checksums 검증 후 ledger row 만 기록(`--mark-applied-after-verify`).
   > 적용/ledger/adoption 자동화 스크립트(`scripts/apply-sql-migrations.ts`)는 `database/000_baseline.sql` 확보 후 작성(코드 작업, env-target 가드 재사용).

## G008 — Vercel staging 배포 (Preview + develop)
1. Vercel 프로젝트 → Settings → Git: Production Branch = `main` 유지, Preview Deployments 활성.
2. Settings → Environment Variables: 아래 표대로 **Preview(또는 develop branch scope)** 값을 staging 자격으로 설정. (Custom Environment 는 Pro/Enterprise 기능이므로 무료 기본안은 Preview + branch override)
3. 첫 `develop` push 후 생성된 URL(`https://quest-on-git-develop-<scope>.vercel.app`)을 canonical staging origin 으로 기록 → G009 Site URL/redirect 와 `ALLOWED_ORIGINS` 에 반영.
4. 검증(AC-5): `develop` 배포 Ready, staging URL 200.

| env key | Production(main) | Preview(develop=staging) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | **staging URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon | **staging anon** |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service-role | **staging service-role** |
| `DATABASE_URL` | prod pooler | **staging pooler** |
| `EXPECTED_SUPABASE_REF` | prod ref | **staging ref** (env-target 가드 fail-closed 활성화) |
| `NEXT_PUBLIC_EXPECTED_SUPABASE_REF` | prod ref | **staging ref** |
| `ALLOWED_ORIGINS` | prod 도메인들 | **staging origin** |
| `NEXT_PUBLIC_APP_URL` | prod canonical | staging origin |
| `OPENAI_API_KEY` | prod | staging 저쿼터 권장 |
| `ADMIN_USERNAME/PASSWORD/SESSION_SECRET` | prod | staging 전용(prod 재사용 금지) |
| `UPSTASH_*`, `QSTASH_*` | prod | staging 또는 unset |

> `EXPECTED_SUPABASE_REF`/`NEXT_PUBLIC_EXPECTED_SUPABASE_REF` 를 설정하면 `lib/env-target.ts` 가드가 런타임에서 ref 불일치를 fail-closed 로 차단한다(미설정 시 전환 경고만).

## G007 — main branch protection + 권한 audit
1. `.github/CODEOWNERS` 의 `@jcmaker` 를 실제 리드 handle 로 교체.
2. CI 를 한 번 돌려 check run 이름(`Lint & Type Check`, `Build`)을 확인(required contexts 로 등록할 정확한 이름).
3. branch protection 적용:
   ```sh
   gh api -X PUT repos/jcmaker/quest-on/branches/main/protection \
     --input docs/staging/main-branch-protection.json
   ```
   `docs/staging/main-branch-protection.json` 내용:
   ```json
   {
     "required_status_checks": { "strict": false, "contexts": ["Lint & Type Check", "Build"] },
     "enforce_admins": false,
     "required_pull_request_reviews": { "required_approving_review_count": 1, "require_code_owner_reviews": true, "dismiss_stale_reviews": false },
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   ```
4. **권한 audit(lead-only bypass 증명)**:
   ```sh
   gh api repos/jcmaker/quest-on/collaborators --jq '.[] | {login: .login, perm: .permissions}'
   ```
   admin 권한이 리드 외에 있으면 write/maintain 으로 강등. `enforce_admins=false` 는 admin 전원 bypass 이므로, 비리드 admin 부재가 AC-3 의 전제다.
5. 검증:
   - AC-1: `gh api repos/jcmaker/quest-on/branches/main/protection` 결과가 위 설정과 일치.
   - AC-3: 비리드(write 권한) 계정으로 `git push origin main` → 거부됨.
   - AC-13/16: PR 에서 `Lint & Type Check`+`Build` 만 required, 실패 시 머지 비활성. Playwright/unit advisory 실패는 머지 미차단.

## G005/G006 — staging 생성 후 데이터 채우기
```sh
# 합성 baseline (항상 동작하는 리뷰어 계정)
STAGING_SUPABASE_URL=... STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
STAGING_SEED_PASSWORD=... STAGING_CONFIRM_PROJECT_REF=<staging-ref> \
npx tsx scripts/seed-staging-baseline.ts --dry-run   # 먼저 dry-run
#   → 확인 후 --dry-run 제거하여 실제 시드

# prod 익명화 복사 (선택, 현실적 데이터 필요 시)
PROD_SUPABASE_URL=... PROD_SUPABASE_SERVICE_ROLE_KEY=... \
STAGING_SUPABASE_URL=... STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
npx tsx scripts/copy-prod-to-staging-anonymized.ts                       # dry-run(기본)
#   → counts/PII scan 확인 후:
npx tsx scripts/copy-prod-to-staging-anonymized.ts --write --confirm-staging-ref <staging-ref> --limit 50
```
- 검증(AC-10/12): 복사 전후 prod row count 무변화, staging sample PII scan 0건, 산출물 파일 없음.
- recovery drill: 문제 시 staging truncate/project reset, 노출 키 revoke, allowlist 보강 후 재실행.

---

## 마스터 검증 체크리스트 (AC-1 ~ AC-16)
| AC | 확인 |
|---|---|
| AC-1 | `gh api .../branches/main/protection` = 설정 일치 |
| AC-2 | 리드 admin/bypass 로 main 반영 가능 |
| AC-3 | 비리드 직푸시 거부 + 비리드 admin 부재 |
| AC-4 | develop 직푸시 성공, 보호 없음 |
| AC-5 | develop → Vercel Preview Ready, staging URL 200 |
| AC-6 | staging 가입/OAuth 가 staging callback 귀환 |
| AC-7 | 시드 계정으로 출제→응시·채팅→채점 플로우 완주 |
| AC-8 | staging Supabase ref ≠ prod, Auth 설정 staging |
| AC-9 | Preview env = staging 자격, prod 키 없음, `EXPECTED_SUPABASE_REF` 설정 |
| AC-10 | staging 작업 후 prod count 무변화 |
| AC-11 | `seed-staging-baseline` 재실행 idempotent |
| AC-12 | 익명화 후 PII scan 0, 산출물 파일 없음 |
| AC-13 | `Lint & Type Check`+`Build` required, 실패 시 머지 차단 |
| AC-14 | develop push/PR 에서 CI 실행(required 2개) |
| AC-15 | develop→main PR 은 리드 승인+CI 후 머지 |
| AC-16 | advisory(Playwright/unit) 실패가 main 머지 미차단 |
