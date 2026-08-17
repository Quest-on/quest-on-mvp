#!/usr/bin/env bash
#
# 로컬 테스트 DB 준비.
#
# 이 스크립트가 끝나면 CI 와 같은 상태가 된다:
#   npm run test:api                       -> 381 passed
#   npx playwright test --project=browser-e2e -> 40 passed
#
# 예전 버전은 Prisma 스키마와 sql/*.sql 만 올려서 대부분의 테스트가 죽었다.
# 실제로 필요한 것은 .github/actions/test-setup/action.yml 이 하는 전부다:
#   비-Prisma 테이블 / API 롤 권한 / 보안 하드닝 / 온보딩 시드.
#
# 안전: 127.0.0.1 로컬 스택만 건드린다. 원격 DB 에는 절대 쓰지 않는다.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_$(basename "$PWD")}"
PSQL="docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres"

echo "=== Quest-On 테스트 DB 준비 ==="

# ─────────────────────────────────────────────────────────────
# 1. 로컬 Supabase
# ─────────────────────────────────────────────────────────────
echo "[1/7] 로컬 Supabase 기동"
npx -y supabase@latest start || echo "  이미 실행 중"

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "  !! DB 컨테이너 ${DB_CONTAINER} 를 못 찾았다. DB_CONTAINER 로 지정하라." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────
# 2. 스키마
# ─────────────────────────────────────────────────────────────
echo "[2/7] pgvector 확장"
$PSQL -q -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null

echo "[3/7] Prisma 스키마"
# --force-reset 은 쓰지 않는다. 파괴적이라 동의 게이트에 걸리고,
# 새로 만든 DB 에는 지울 것도 없다.
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  npx prisma db push --accept-data-loss --skip-generate >/dev/null

# ─────────────────────────────────────────────────────────────
# 3. SQL 마이그레이션
# ─────────────────────────────────────────────────────────────
echo "[4/7] SQL 마이그레이션"
for d in sql database; do
  [ -d "$d" ] || continue
  for f in "$d"/*.sql; do
    [ -f "$f" ] || continue
    $PSQL -q -f - < "$f" >/dev/null 2>&1 || true
  done
done
# profiles 는 Prisma 가 만들지 않는다. 아래 5단계에서 만든 뒤 의존 마이그레이션을
# 다시 돌려야 plan 컬럼이 생긴다 — admit_exam_session 이 그 컬럼을 읽는다.

# ─────────────────────────────────────────────────────────────
# 4. 비-Prisma 테이블
# ─────────────────────────────────────────────────────────────
echo "[5/7] 비-Prisma 테이블 (profiles, instructor_profiles, paste_logs, error_logs)"
$PSQL -q <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  role TEXT,
  status TEXT,
  display_name TEXT,
  avatar_url TEXT,
  school TEXT,
  student_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS instructor_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  school TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paste_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  q_idx INT,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

# profiles 가 생겼으니 의존 마이그레이션을 다시 돌린다(plan/language 컬럼).
for f in database/017_profiles_add_language.sql \
         database/018_onboarding_activation.sql \
         database/019_profiles_rls.sql \
         database/021_clear_pending_status.sql; do
  [ -f "$f" ] && $PSQL -q -f - < "$f" >/dev/null 2>&1 || true
done

# ─────────────────────────────────────────────────────────────
# 5. API 롤 권한 + 보안 하드닝
# ─────────────────────────────────────────────────────────────
echo "[6/7] API 롤 권한 + 보안 하드닝"
# Prisma 가 postgres 롤로 테이블을 만들어서 Supabase 의 anon/authenticated/
# service_role 에는 권한이 없다. 이게 없으면 전부 permission denied 로 죽는다.
$PSQL -q <<'SQL' >/dev/null
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
SQL

# 위 blanket GRANT 는 보안 경계까지 열어버린다. 반드시 되감는다 —
# 028 은 service_role 도 ai_config_* 를 직접 못 쓰게 한다(RPC 만이 쓰기 경로).
$PSQL -q -f - < database/028_create_ai_config.sql >/dev/null 2>&1 || true
$PSQL -q <<'SQL' >/dev/null
REVOKE ALL ON public.plan_limits FROM anon, authenticated;
REVOKE ALL ON public.onboarding_events FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
REVOKE ALL ON public.consent_policy_releases FROM anon, authenticated;
REVOKE ALL ON public.consent_purge_runs FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.admit_exam_session(uuid, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM anon, authenticated;
SQL

# ─────────────────────────────────────────────────────────────
# 6. 온보딩 시드
# ─────────────────────────────────────────────────────────────
echo "[7/7] 테스트 사용자 온보딩 시드"
# 이게 없으면 브라우저 E2E 가 전부 /onboarding 으로 튕긴다.
#
# 동의 주체는 user_id 가 아니라 subject_ref = 'v1:' + HMAC-SHA256(user_id) 다.
# 그리고 테스트 바이패스 경로(proxy.ts)는 userId 로 쿠키의 사용자 id 가 아니라
# 리터럴 "test-bypass" 를 넘긴다. 그래서 두 주체 모두 시드해야 한다.
node -e '
const crypto = require("crypto");
const fs = require("fs");
const env = fs.readFileSync(".env.test", "utf8");
const key = (env.match(/^CONSENT_SUBJECT_HMAC_KEY_V1=(.*)$/m) || [])[1] || "";
const ref = (id) =>
  "v1:" + crypto.createHmac("sha256", Buffer.from(key.trim(), "base64")).update(id).digest("hex");
console.log(["test-bypass", "test-instructor-id", "test-student-id"].map(ref).join("\n"));
' > /tmp/qo-refs.txt

REF_BYPASS=$(sed -n '1p' /tmp/qo-refs.txt)
REF_INST=$(sed -n '2p' /tmp/qo-refs.txt)
REF_STU=$(sed -n '3p' /tmp/qo-refs.txt)
rm -f /tmp/qo-refs.txt

$PSQL -q \
  -v b="$REF_BYPASS" -v i="$REF_INST" -v s="$REF_STU" <<'SQL' >/dev/null
INSERT INTO instructor_profiles (id, name, email, school, status)
VALUES ('test-instructor-id','Test Instructor','test-instructor@test.local','Test University','active')
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO profiles (id, role, status, display_name, school)
VALUES ('test-instructor-id','instructor','active','Test Instructor','Test University'),
       ('test-student-id','student','active','Test Student','Test University')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

-- controller_type 은 'platform' 만 허용된다(check 제약).
INSERT INTO consent_records (subject_ref, controller_type, consent_key, granted, policy_version)
SELECT r, 'platform', k, true,
       (SELECT release_id FROM consent_policy_releases ORDER BY effective_at DESC LIMIT 1)
FROM unnest(ARRAY[:'b', :'i', :'s']) r,
     unnest(ARRAY['age_over_14','terms']) k
WHERE NOT EXISTS (
  SELECT 1 FROM consent_records c
  WHERE c.subject_ref = r AND c.consent_key = k
);
SQL

echo ""
echo "=== 준비 완료 ==="
echo "  Supabase   http://127.0.0.1:54321"
echo "  Postgres   postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "  Studio     http://127.0.0.1:54323"
echo ""
echo "  npm run test:api"
echo "  npx playwright test --project=browser-e2e --config=e2e/playwright.config.ts"
