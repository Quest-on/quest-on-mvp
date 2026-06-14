# 보안 사고: prod Supabase service-role 키 노출 (2026-06)

## 요약
공개 리포 `jcmaker/quest-on`의 git-tracked 스크립트에 **prod Supabase service-role JWT**(프로젝트 ref `fmhpwotcfshoqpdhzqqj`)가 하드코딩되어 있었다. service-role 키는 RLS를 우회하는 전체 관리자 권한이므로, 노출 기간 동안 누구나 prod DB의 전체 학생 PII·시험·채점 데이터를 읽고 쓸 수 있었다.

- 노출 위치(수정 완료, working tree):
  - `scripts/fix-mba-questions.js` — env-only로 전환됨
  - `scripts/seed-mba-demo.js` — env-only로 전환됨
- **중요:** 두 파일을 수정해도 **git 히스토리에는 키가 그대로 남는다**. 따라서 키 무효화의 유일한 안전 수단은 **rotation(재발급)**이다. history rewrite(filter-repo)는 보조 수단일 뿐 rotation을 대체하지 못한다.

## 영향 범위
- prod Supabase 프로젝트 `fmhpwotcfshoqpdhzqqj`의 service-role 키.
- 같은 키가 로컬 `.env.local`(gitignore됨, 추적 안 됨)에도 존재 — 추적 파일은 아니나 같은 값이므로 rotation 대상.
- anon 키와 DB 접속 비밀번호는 직접 노출은 아니지만, JWT secret rotation 시 anon 키도 함께 무효화되므로 동반 교체가 안전하다.

## Rotation 런북 (운영자 — 사용자 수행 필요)
> 아래는 Supabase/Vercel/GitHub 대시보드 작업이라 에이전트가 대신 수행할 수 없다. 완료 후 각 항목을 체크하고 에이전트에 "rotation 완료"를 알려야 이후 staging rollout 골이 진행된다.

1. **Supabase JWT secret rotation** (service-role + anon 동시 무효화):
   - Supabase 대시보드 → 프로젝트 `fmhpwotcfshoqpdhzqqj` → Settings → API → "JWT Settings" / "Rotate JWT secret".
   - rotation 후 새 `service_role` 키와 `anon` 키를 확보한다. (기존 키는 즉시 무효화됨)
2. **DB 비밀번호 rotation**:
   - Settings → Database → "Reset database password". 새 `DATABASE_URL`(pooler/direct) 비밀번호를 확보한다.
3. **새 키 배포처 갱신** (prod 한정):
   - Vercel(Production) 환경변수: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`.
   - 로컬 `.env.local`.
   - 비밀번호 관리자(password manager).
4. **무효화 검증**:
   - 옛 service-role 키로 Supabase REST/Admin API 호출 → 401/403 확인.
   - 옛 anon 키로 호출 → 실패 확인.
   - 옛 DB 비밀번호로 pooler/direct 접속 → 실패 확인.
5. **새 prod smoke**:
   - 새 키로 prod 앱 정상 동작(로그인/주요 API) 확인.
6. (선택) **git 히스토리 정리**: `git filter-repo`로 과거 커밋의 키 문자열 제거 + force-push. rotation을 대체하지 않는 보조 조치.

## Incident evidence 체크리스트
| 항목 | 상태 | 증거 |
|---|---|---|
| `scripts/fix-mba-questions.js` env-only 전환 | ☑ 코드 완료 | working tree 수정, secret-scan 통과 |
| `scripts/seed-mba-demo.js` env-only 전환 | ☑ 코드 완료 | working tree 수정, secret-scan 통과 |
| secret-scanning CI 추가 | ☑ 코드 완료 | `scripts/check-secrets.mjs` + `.github/workflows/secret-scan.yml`, 음성/양성 테스트 통과 |
| old service-role 키 REST/Admin 실패 | ☐ 운영자 | (rotation 후 기록) |
| old anon/public 키 무효화 | ☐ 운영자 | (rotation 후 기록) |
| old DB 비밀번호(direct/pooler) 실패 | ☐ 운영자 | (rotation 후 기록) |
| Vercel/GitHub/password manager secret 갱신 | ☐ 운영자 | (rotation 후 기록) |
| 새 prod smoke 통과 | ☐ 운영자 | (rotation 후 기록) |
| (선택) git 히스토리 정리 | ☐ 운영자 | (수행 시 기록) |

## 재발 방지
- `scripts/check-secrets.mjs`가 git-tracked source/docs/config에서 실제 service-role JWT(`role=service_role`, `iss≠supabase-demo`)와 추적된 secret env 파일(`.env`, `.env.local`, `.env.*.local`, `.env.production`; 단 `.env.example`/`.env.test`/`.env.sample` 허용)을 차단한다.
- `.github/workflows/secret-scan.yml`가 main/develop push·PR에서 강제 실행한다. (CI required check 등록은 G003에서 branch protection과 함께 처리)
- 모든 service-role/mutating 스크립트는 키를 env로만 주입한다(공통 가드는 G002에서 적용).
