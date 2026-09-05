# 스테이징 환경

프로덕션에 나가기 전 **같은 코드·같은 런타임**에서 팀이 QA 하는 환경. Vercel 계정이 없는 사람(교수자·외부 검수자)도 실제 도메인으로 들어온다.

그래서 스테이징은 "테스트 서버"가 아니라 **데이터만 가짜인 프로덕션**이다. 인증·CORS·크론·백그라운드 채점이 프로덕션과 동일하게 동작해야 하고, 우회 장치는 두지 않는다.

---

## 원칙 (여기서 갈라지면 스테이징이 무의미해진다)

1. **프로덕션 자원을 공유하지 않는다.** Supabase 프로젝트, Upstash DB, 관리자 비밀번호, OpenAI 키 전부 별도. 공유하면 스테이징 QA 가 프로덕션 레이트리밋 카운터를 태우고 프로덕션 예산을 쓴다.
2. **프로덕션 데이터를 복사하지 않는다.** 학생 실명·이메일·답안 전문이 들어 있고, 스테이징은 외부 참여자가 들어오는 환경이다. 시드 데이터로 채운다.
3. **인증 우회 없음.** `TEST_BYPASS_SECRET` / `NEXT_PUBLIC_TEST_BYPASS_ENABLED` 는 스테이징에 넣지 않는다. 넣으면 `lib/supabase-auth.ts` 가 요청 처리 중 throw 한다. E2E 바이패스는 로컬(`development`)과 CI(`test`)에만 존재한다.
4. **스테이징 런타임은 프로덕션 크리덴셜을 절대 갖지 않는다.** 스테이징이 뚫려도 프로덕션이 열리지 않아야 한다.

---

## 토폴로지

| 항목 | 프로덕션 | 스테이징 |
|---|---|---|
| Git 브랜치 | `main` | `staging` |
| Vercel 프로젝트 | quest-on | quest-on-staging (별도 프로젝트) |
| 도메인 | quest-on.app | `quest-on-staging-two.vercel.app` (커스텀 도메인 미연결) |
| `NEXT_PUBLIC_APP_ENV` | (미설정 또는 `production`) | **`staging` (필수)** |
| Supabase | 프로덕션 프로젝트 | 스테이징 전용 프로젝트 |
| Upstash Redis | 프로덕션 DB | 스테이징 전용 DB |
| QStash | 공용 계정, 콜백 = quest-on.app | 공용 계정, 콜백 = staging.quest-on.app |
| OpenAI | 프로덕션 키 | 예산 한도 건 별도 키 |

**왜 preview 배포가 아니라 별도 프로젝트인가**
- Vercel Cron 은 프로덕션 배포에서만 돈다. preview 로 두면 `grading-sweep` / `agent-sweeper` / `assignment-deadline-sweep` 이 아예 실행되지 않아 채점 파이프라인을 검증할 수 없다.
- preview URL 은 배포마다 바뀐다. QStash 가 in-flight 재시도를 죽은 배포로 보낸다 (`lib/qstash.ts` 의 `VERCEL_URL` 폴백 경고 참고).
- Vercel 계정 없는 QA 참여자가 Deployment Protection 에 막힌다.

**`NEXT_PUBLIC_APP_ENV=staging` 이 필수인 이유**: 별도 Vercel 프로젝트는 그쪽도 `VERCEL_ENV=production` 이다. 이 선언이 없으면 스테이징이 자기를 프로덕션이라고 믿고 색인 허용·프로덕션 CORS 기본값으로 동작한다. 오타를 내면 `next.config.ts` 가 빌드를 깬다.

---

## 배포 흐름

```
feat/xxx  ──PR──▶  staging  ──자동배포──▶  quest-on-staging-two.vercel.app  ──QA──▶  PR ──▶  main  ──▶  quest-on.app
```

- 모든 작업 PR 의 base 는 `staging`.
- `staging` → `main` 승격 PR 은 "이번 배포에 뭐가 들어가는지" 목록 역할을 한다.
- 핫픽스도 같은 경로로 간다. `main` 직행은 git hook 이 막는다.
- **배포는 Vercel Git 연동이 아니라 GitHub Actions 가 수행한다** (`.github/workflows/deploy.yml`).
- 경로가 브랜치마다 다르다. 같은 `deploy.yml` 을 쓰지만 부르는 방식이 갈린다:
  - **staging**: `ci.yml` 이 모든 검사를 통과한 뒤 `workflow_call` 로 직접 부른다.
    staging CI 런 안에 `Deploy (staging)` 잡으로 나타난다.
  - **main**: `workflow_run` 으로 CI 완료를 받아 실행한다.

  왜 갈랐는가 — `workflow_run` 트리거는 **기본 브랜치(main)의 워크플로 파일 기준**으로
  등록된다. main 이 뒤처져 있으면 staging 을 아무리 고쳐도 등록되지 않는다. 실제로 그래서
  자동 배포가 한 번도 걸리지 않았고 배포 60건이 전부 수동 `workflow_dispatch` 였다(이슈 #209).
  `push`/`workflow_call` 은 그 브랜치의 파일을 쓰므로 main 에 의존하지 않는다.
  Git 연동 배포는 "커밋한 사람의 Vercel 계정에 배포 권한이 있을 것"을 요구해서, 팀원이 바뀔 때마다
  seat 를 사야 하고 권한 없는 사람이 커밋하면 배포가 조용히 멈춘다. 배포 주체를 사람에서 CI 로 옮겼다.
- **빌드는 Vercel 에서 돈다.** CI 에서 `vercel build --prebuilt` 로 빌드하면 커밋당 빌드가 1회로
  줄지만, 그러려면 `vercel pull` 로 프로덕션 환경변수 전량을 GitHub 러너에 내려받아야 한다.
  `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`QSTASH_TOKEN` 이 배포마다 러너 디스크에 떨어진다.
  원칙 4("프로덕션 크리덴셜은 밖으로 나가지 않는다")를 CI 에도 그대로 적용한다.

---

## 최초 구축 체크리스트 (계정 소유자 수동 작업)

### 1. Supabase 스테이징 프로젝트
- [ ] 같은 Org 안에 새 프로젝트 생성 (리전은 프로덕션과 동일하게)
- [ ] `database/*.sql` 을 **번호 순서대로** 전량 적용 (프로덕션에 적용된 것과 동일한 집합인지 확인)
- [ ] Storage 버킷을 프로덕션과 같은 이름으로 생성 (업로드/텍스트추출 경로가 버킷명을 공유한다)
- [ ] Auth → URL Configuration
  - Site URL: `https://staging.quest-on.app`
  - Redirect URLs: `https://staging.quest-on.app/auth/callback`
- [ ] Auth → Providers: Google 등 프로덕션에서 쓰는 프로바이더 동일하게 활성화
- [ ] Google Cloud Console → OAuth 클라이언트에 스테이징 Supabase 콜백 URL 추가

### 2. Vercel 스테이징 프로젝트
- [ ] 같은 Team 에 새 프로젝트 생성, 같은 저장소 연결
- [ ] Production Branch = `staging` (이 프로젝트의 "프로덕션"이 staging 브랜치다 → 크론이 돈다)
- [ ] Ignored Build Step 으로 `main` 푸시에 반응하지 않게 정리
- [ ] 도메인 `staging.quest-on.app` 연결 — **아직 안 됨.** 현재는 Vercel 기본 도메인(`quest-on-staging-two.vercel.app`)으로 QA 한다
- [ ] Deployment Protection: 프로덕션 배포(=staging 브랜치)는 **공개**, preview 는 보호 유지
- [ ] 환경변수 주입 — `.env.staging.example` 기준. 값 채운 뒤 `npm run env:check -- --env staging --file .env.staging` 로 검증 후 넣는다

### 3. 나머지 연동
- [ ] Upstash Redis 스테이징 DB 생성
- [ ] OpenAI 스테이징 전용 키 + 월 예산 한도 설정
- [ ] `CRON_SECRET` / `INTERNAL_API_SECRET` / `ADMIN_SESSION_SECRET` 을 프로덕션과 **다른 값**으로 새로 생성
- [ ] QStash: 콜백이 스테이징으로 가도록 `QSTASH_WORKER_BASE_URL=https://staging.quest-on.app`

### 4. 시드
- [ ] 관리자 계정 1개, 교수자 계정 1~2개, 학생 계정 5~10개를 Supabase Auth 에서 직접 생성
- [ ] `profiles` 의 `role` / `status` 를 approved 로 세팅 (교수자는 승인 대기 플로우도 한 번은 QA 대상)
- [ ] 데모 시험/과제 1개씩 생성해 채점 파이프라인까지 한 번 통과시킨다

---

## 배포 후 확인

```bash
# 1. 공개 헬스체크 (인증 불필요, 상태만)
curl https://quest-on-staging-two.vercel.app/api/health

# 2. 상세 진단 — 관리자 로그인 후 (환경/누락 변수/연동 활성 여부)
#    응답의 runtime.appEnv 가 "staging" 이어야 한다. "production" 이면 즉시 중단하고
#    NEXT_PUBLIC_APP_ENV 를 고친다.
#    runtime.integrations.authBypass 가 true 면 즉시 키를 제거한다.

# 3. robots — 스테이징은 전면 disallow 여야 한다
curl https://quest-on-staging-two.vercel.app/robots.txt
```

화면 아래 가운데에 `STAGING` 배지가 보이지 않으면 환경 선언이 잘못된 것이다.

---

## 현재 상태 — main 이 멈춰 있다 (2026-09-03)

이 문서가 설명하는 흐름 중 **`staging → main` 구간이 실제로는 돌지 않고 있다.** 문서를
믿고 판단하면 틀리므로 사실을 적어 둔다.

| | 상태 |
|---|---|
| `main` 마지막 커밋 | 2026-08-09 |
| `staging` 이 앞선 커밋 | 379 |
| `deploy.yml` 의 main 배포 실행 | **0건** (전체 60건이 staging) |
| 승격 PR #119 | 2026-08-09 개설, 계속 열림. 541파일 / +34467 -6350 |

즉 프로덕션은 8/9 자 코드로 돌고 있고, 온보딩 액티베이션(Epic #79) 이후의 모든 작업이
프로덕션에 반영돼 있지 않다. 프로덕션 자체는 정상이다 — 그 시점 코드는 새 DB 객체를
참조하지 않으므로(`app/` 에서 `lib/plan-limits`·`lib/onboarding-events`·`lib/demo-completion`
import 0건) 스테이징을 죽였던 스키마 드리프트가 프로덕션엔 없다.

**승격은 추가 전용이 아니다.** main 이후 쌓인 migration 15건 중 데이터를 바꾸는 것이 있다:

| migration | 프로덕션 데이터에 하는 일 |
|---|---|
| `019_profiles_rls` | `profiles` 에 RLS 활성화 + 정책 재생성 |
| `020_backfill_first_published_at` | `exams` 일괄 UPDATE |
| `021_clear_pending_status` | `profiles`·`instructor_profiles` 일괄 UPDATE. **대기 중 교수자가 일괄 승인된다** + status 기본값을 `approved` 로 변경 |
| `022_clean_demo_preview_metrics` | `onboarding_events` DELETE + `exams` 2회 UPDATE |

나머지 11건(`023`~`034`)은 테이블·컬럼·함수 추가이며, 함수 본문 안의 DML 은 호출 시에만 돈다.

승격 순서는 아래 "DDL 변경 순서"를 따르되, **위 4건은 프로덕션 데이터에 미치는 영향을
개별로 승인받고 진행한다.** 스키마 변경 없이 코드만 올리면 프로덕션이 스테이징과 같은
방식으로 조용히 죽는다 — 그게 이슈 #324 였다.

---

## DDL 변경 순서

마이그레이션 도구가 없고 `database/[NNN]_*.sql` 수기 적용이다. 순서를 지킨다.

1. `database/[NNN]_설명.sql` 추가 (PR 에 포함)
2. **스테이징 Supabase 에 먼저 적용**
3. staging 배포에서 QA
4. `staging` → `main` 머지 **직전**에 프로덕션 Supabase 에 적용
5. 프로덕션 배포

스키마 변경은 배포보다 먼저 적용돼야 한다 (새 코드가 없는 컬럼을 읽으면 즉시 500). 컬럼 삭제·타입 변경은 두 단계로 나눈다: 먼저 코드에서 사용 제거 → 배포 → 다음 릴리스에서 컬럼 제거.

---

## 하지 말 것

- 프로덕션 DB 덤프를 스테이징에 복원하지 않는다.
- 스테이징 환경변수에 프로덕션 Supabase URL / service_role 키를 넣지 않는다. `/api/health` 의 `runtime` 으로 상시 확인한다.
- 스테이징에서 실제 수업을 진행하지 않는다. 배지와 `robots.txt` 가 있지만 최종 방어선은 사람이다.
- 스테이징에 `TEST_BYPASS_SECRET` 을 넣지 않는다. 넣으면 앱이 throw 한다 — 그게 의도다.
