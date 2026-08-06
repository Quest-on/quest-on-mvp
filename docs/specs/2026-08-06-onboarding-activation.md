# Deep Interview Spec: 교수자·학생 온보딩 (Onboarding Activation)

## Metadata
- Interview ID: a7f3c1e2-9b4d-4c8a-8e21-5d0f6a3b7c94
- Rounds: 13 (+ Round 0 topology gate)
- Final Ambiguity Score: 18%
- Type: brownfield
- Generated: 2026-08-06
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no
- Status: BELOW_THRESHOLD_EARLY_EXIT (사용자 명시 승인 — 잔여 모호도는 구현 세부이며 ralplan 합의에서 해소)
- Auto-Researched Rounds: none
- Auto-Answered Rounds: [12]
- Architect Failures: 0
- Lateral Reviews: 1 convened (milestone initial→progress) — 전원 실패
- Lateral Panel Failures: 4
- Refined Rounds: [3, 5, 6, 9, 10, 11]
- Closure Overrides: 0 (f23 에이전트 결정을 사용자가 명시 승인하며 통과)
- Restated Goal: 신규 교수자가 가입 직후 JTBD 2문항만 답하고 자기 과목 데모를 학생 시점으로 AI 채점 열람까지 끝까지 겪은 뒤, 관리자 승인을 기다리지 않고 무료 한도(발행 3회·학생 5명) 안에서 실제 시험을 발행해 첫 학생 제출까지 도달하게 하고 — 이때 학생은 첫 응시 전 'AI 질문은 허용되며 질문 자체도 평가 대상이고 대화는 교수자에게 공개된다'를 고지받으며 — 데모 완주와 첫 학생 제출 두 지점을 계측한다.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.85 | 0.35 | 0.298 |
| Constraint Clarity | 0.82 | 0.25 | 0.205 |
| Success Criteria | 0.79 | 0.25 | 0.198 |
| Context Clarity | 0.78 | 0.15 | 0.117 |
| **Total Clarity** | | | **0.817** |
| **Ambiguity** | | | **0.183** |

## Topology

| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| signup-identity | active | 가입→역할→프로필 수집 재정비 | f18, f4, f5 / AC-1~AC-4 |
| instructor-approval-gate | active | 발행 한도 + 인증 승격 | f17, f19, f21, f22, f24 / AC-9~AC-13 |
| instructor-first-run | active | 데모 생성·완주·AI 개방 | f9, f10, f12, f20 / AC-5~AC-8 |
| student-first-run | active | 응시 전 고지 + 교수자 공지 템플릿 | f6, f7, f11, f13, f23 / AC-14~AC-16 |
| activation-metrics | active | 2단계 지표 계측 | f2, f12, f20 / AC-17~AC-19 |

Deferred components: 없음 (5개 전부 active).

## Established Facts

| id | 사실 | round | 상태 |
|----|------|-------|------|
| f1 | 샌드박스 허용(발행만 승인) | 1 | **disputed → f14** |
| f2 | 2단계 지표: 즉시=데모 완주, 진짜=첫 학생 제출 | 2 | 유효 |
| f3 | intake를 데모 생성 입력으로 사용, 건너뛰기 허용 | 3 | 유효(f18에 흡수) |
| f4 | 이름은 지연 대상 아님. 지연 대상은 학교 검색·학번 | 3 | 유효 |
| f5 | 역할은 CustomSignUp에서 이미 받으므로 재질문 제거 | 3 | 유효 |
| f6 | 학생 첫 응시 전 preflight에 3줄 고지 + 명시 확인 | 4 | 유효 |
| f7 | 교수자용 학생 공지 템플릿 생성 | 4 | 유효 |
| f8 | clarification 단계 자체가 채점 대상(코드 근거). 학생 54%는 AI 사용을 부정행위로 인식 | 4 | 유효 |
| f9 | 데모는 과목 카테고리별 템플릿을 duplicateExam으로 복제. 최초 진입 AI 호출 0 | 5 | 유효 |
| f10 | AI 데모 생성은 관여도 기반 개방. 승인 여부와 무관 | 5 | 유효 |
| f11 | 학생은 captive user. 성공 기준은 완주율이 아니라 오해 없는 사용 | 6 | 유효 |
| f12 | 데모 완주 = 학생 시점 1문항 답변 + AI 채점 결과 열람 | 6 | 유효 |
| f13 | 학생 온보딩 투자 상한: 3줄 고지 + 공지 템플릿. 연습 문항은 과잉 | 6 | 유효 |
| f14 | 승인 게이트 완전 제거 | 7 | **disputed → f17** |
| f15 | intake 근거 절반 소멸 | 7 | **disputed → f18** |
| f16 | 관리자 가시성 화면만, 강제 장치 범위 밖 | 8 | **disputed → f19** |
| f17 | 게이트는 발행(코드 활성화)에만. 생성·편집·데모는 무제한 | 9 | 유효 |
| f18 | 가입 폼 미변경. 온보딩은 현행(이름+소속) 유지 + 역할 재질문 제거·이중기록 수정·중복 경로 정리·JTBD 2문항 추가 | 9 | 유효 |
| f19 | 발행 게이트는 차단이 아니라 사용 한도. 초과 시 인증 요구. 관리자 가시성 화면 승계 | 10 | 유효 |
| f20 | DB: exams.is_demo + onboarding_events 신규 + profiles.plan 컬럼(한도는 상수) | 11 | 유효 |
| f21 | free 한도: 발행 3회, 발행당 학생 5명 | 11 | 유효 |
| f22 | 한도 안내문은 의심이 아니라 사유 설명 톤. next-intl 관리 | 11 | 유효 |
| f23 | 공지 템플릿은 복사 가능한 텍스트 블록만. 공유 링크 라우트 없음 | 12 | 유효(에이전트 결정 → 사용자 승인) |
| f24 | 발행 횟수 = 한번이라도 발행된 exam 로우 개수(is_demo 제외). 재발행 미산입 | 13 | 유효 |

분쟁 사실 4건 전부 `superseded_by` 로 종결. 원본은 감사 목적으로 보존.

## Trigger Metadata

| Round | Trigger | Component/Dimension | Ambiguity | 근거 |
|-------|---------|---------------------|-----------|------|
| 4 | D 범위 확장 | instructor-first-run / constraints | 54%→47% ↓ | 공지 템플릿이 신규 산출물로 추가(축소 아닌 추가라 intent review 불요) |
| 6 | A 재규정 | student-first-run / criteria | 45%→36% ↓ | 학생=captive user. 완주율→오해 없는 사용으로 성공 기준 교체 |
| 7 | A 직접 모순 + D | instructor-approval-gate / constraints | 36%→**46% ↑** | f1 철회, 승인 게이트 제거. 사후 모니터링 실체 미정 + intake 근거 절반 소멸 |
| 9 | A 직접 모순 | instructor-approval-gate / criteria | 37%→32% ↓ | f14 철회, f1 구조 복귀. 같은 라운드 내 supersession으로 해소 |
| 10 | A 직접 모순 | instructor-approval-gate / criteria | 32%→26% ↓ | f16 철회. 게이트를 차단에서 한도로 재설계 |

## Lateral Review Panel

Round 3(milestone initial→progress)에서 researcher / contrarian / simplifier 3인을 fork-context architect로 병렬 소집했으나 **전원 실패**(재시도 3회 소진). 이후 refined 전이(Round 10)에서도 동일 경로라 판단해 생략. `lateral_panel_failures = 4`.

폴백으로 메인 세션이 렌즈를 인라인 적용했으며, researcher 레인이 담당했을 외부 근거는 직접 웹 리서치로 대체 확보함(학생 AI 인식 조사, 폼 필드 수 전환율, 온보딩 마이크로서베이 문헌).

## Goal

신규 교수자가 관리자 승인을 기다리지 않고 가입 직후 자기 과목 데모를 학생 시점으로 끝까지 겪은 뒤, 무료 한도 안에서 실제 시험을 발행해 첫 학생 제출까지 도달하게 한다. 학생은 첫 응시 전 AI 사용 정책을 고지받는다. 두 액티베이션 지점을 계측한다.

## Constraints

- 가입 폼(`components/auth/CustomSignUp.tsx`)은 수정하지 않는다.
- 시험 생성/authoring 페이지(`instructor/new`, `instructor/[examId]/edit`)는 수정하지 않는다. 과거 명시적으로 거부된 범위 확장이다.
- 신규 API는 `/api/supa` 액션 스위치가 아니라 리소스형 라우트로만 추가한다(ADR-002).
- 최초 온보딩 경험은 AI 호출 0회. 데모는 `duplicateExam` 기반 템플릿 복제.
- AI 데모 생성 개방 기준은 관리자 승인이 아니라 데모 완주(관여도).
- 한도값(3회·5명)은 상수로 두되 `profiles.plan` 을 경유해 읽어 나중에 `plan_limits` 테이블로 뽑을 수 있게 한다.
- 모든 사용자 노출 문구는 next-intl ko/en 메시지. 하드코딩 금지.
- 한도 안내문은 사용자를 의심하는 톤이 아니라 사유를 설명하는 톤이어야 한다.
- 신규 테이블은 RLS를 `ai_events` 패턴(service_role write-only)으로 적용한다.
- 사람 코드리뷰 없음. CI(quality/api-e2e/browser-e2e) + impact-review가 유일한 머지 게이트.
- DB 검증은 폐기 가능한 로컬 DB에서만. `.env.local` 로드 금지.

## Non-Goals

- 이메일 발송 인프라 도입(Resend/nodemailer 등 신규 의존성).
- 학생용 연습 문항 / 온보딩 시험.
- 비로그인 공유 링크 라우트.
- `plan_limits` 테이블(과금 도입 시점으로 이월).
- 발행 한도 초과 계정의 자동 정지·수동 차단 등 강제 조치(가시성 조회까지만).
- 학생 완주율·이탈률 기반 지표.
- LMS 연동.

## Acceptance Criteria

### signup-identity
- [ ] AC-1: WHEN 역할이 이미 정해진 사용자가 `/onboarding` 에 진입 THEN 역할 선택 단계를 건너뛰고 프로필 단계부터 시작한다
- [ ] AC-2: WHEN 온보딩 프로필 저장이 호출 THEN `profiles` 와 role별 프로필 기록이 원자적으로 처리되고, 두 번째 기록이 실패하면 사용자에게 오류가 노출된다 (현행: 조용히 무시)
- [ ] AC-3: WHEN 학생이 프로필을 설정 THEN `/onboarding` 과 `/student/profile-setup` 중 단일 경로만 존재한다
- [ ] AC-4: WHEN 교수자가 프로필 단계를 완료 THEN JTBD 2문항(평가 대상: 시험/과제, 담당 과목)을 답하고 그 답이 `InstructorIntake` 로 저장된다

### instructor-first-run
- [ ] AC-5: WHEN 교수자가 JTBD 2문항을 제출 THEN 해당 타입·과목 카테고리의 `DemoTemplate` 이 복제되어 `is_demo=true` 인 exam이 생성되고, 이 과정에서 OpenAI 호출이 0회다
- [ ] AC-6: WHEN 교수자가 JTBD 2문항을 건너뜀 THEN 고정 기본 템플릿이 복제되고, 발행 직전에 동일 문항을 다시 묻는다
- [ ] AC-7: WHEN 교수자가 데모에서 학생 시점으로 1문항을 답하고 AI 채점 결과를 열람 THEN `demo_graded_viewed` 이벤트가 기록되고 데모 완주로 판정된다
- [ ] AC-8: WHEN 데모 완주 THEN AI 기반 데모 재생성 기능이 개방된다. 완주 전에는 개방되지 않는다

### instructor-approval-gate
- [ ] AC-9: WHEN `plan='free'` 교수자가 4번째 서로 다른 exam을 발행 시도 THEN 발행이 차단되고 인증 요청 안내가 표시된다
- [ ] AC-10: WHEN `plan='free'` 교수자가 발행한 시험에 6번째 학생이 입장 시도 THEN 입장이 차단되고 안내가 표시된다
- [ ] AC-11: WHEN 이미 발행했던 exam을 수정 후 재발행 THEN 발행 횟수가 증가하지 않는다
- [ ] AC-12: WHEN 한도 초과 안내가 표시 THEN 문구에 제한 사유("학생의 교수자 계정 오용 방지")와 해제 방법이 포함되며, next-intl 메시지에서 로드된다
- [ ] AC-13: WHEN 관리자가 교수자를 승인 THEN `profiles.plan` 이 `verified` 로 변경되고 한도가 해제된다

### student-first-run
- [ ] AC-14: WHEN 학생이 처음으로 시험 preflight에 진입 THEN AI 질문 허용·질문 자체도 평가 대상·대화의 교수자 공개 3가지가 고지되고 명시적 확인을 받는다
- [ ] AC-15: WHEN 학생이 고지를 확인 THEN 확인 시각이 기록되고 이후 응시에서 재노출되지 않는다
- [ ] AC-16: WHEN 교수자가 시험 상세 화면에서 공지문 복사를 실행 THEN 시험 제목·입장 코드·AI 사용 안내가 포함된 텍스트가 클립보드에 복사된다

### activation-metrics
- [ ] AC-17: WHEN `is_demo=true` 인 exam이 존재 THEN 교수자 시험 목록·통계·발행 횟수 카운트 어디에도 나타나지 않는다
- [ ] AC-18: WHEN 동일 마일스톤 이벤트가 중복 기록 시도 THEN `UNIQUE(user_id, event)` 로 최초 1건만 남고 오류가 발생하지 않는다
- [ ] AC-19: WHEN 관리자가 `/admin` 을 조회 THEN 신규 교수자 목록·발행 현황·AI 비용을 확인할 수 있으며, 교수자의 소속이 함께 표시된다 (현행: 쿼리에서 school 누락)

## Deferrals

- **Convergence Pacing**: min-round floor / score-drop cap / dampening 미도입. 양방향 스코어링 자체가 페이싱 메커니즘.
- **plan_limits 테이블**: 과금 도입 시점으로 이월. 이번엔 `profiles.plan` 컬럼 + 상수.
- **이메일 알림**: 신규 의존성 회피. 인앱 상태 표시로 대체.
- **AI 데모 생성 구현 상세**: 개방 조건만 확정. 생성 로직 자체는 ralplan에서.

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 승인 게이트는 온보딩과 무관한 운영 이슈다 | 가입→첫 가치 시간이 사람 응답 속도에 묶임 | 게이트를 발행으로 이동 후, 다시 "차단"에서 "무료 한도"로 재설계 |
| 온보딩 = 프로필 정보 수집 | 즉시 소비되지 않는 필드는 이유 없는 질문 | JTBD 2문항만 온보딩. 나머지는 발행 직전 |
| 과목 맞춤 데모는 AI로 생성해야 한다 | 엉터리 생성물이 첫인상을 망침 + 미인증 계정에 AI 비용 노출 | 템플릿 복제로 시작, 데모 완주 후 AI 개방 |
| 학생 온보딩도 완주율로 측정한다 | 학생은 captive user | 성공 기준을 "오해 없는 사용"으로 교체 |
| 데모 완주는 "데모를 열어본 것" | 리서치가 경고한 체크리스트 허수지표와 동일 | 학생 시점 답변 + AI 채점 열람으로 정의 |
| 이름을 온보딩에서 받아야 한다 | 소셜/가입에서 이미 확보 가능 | 이름은 지연 대상 아님. 학교 검색·학번이 지연 대상 |
| 온보딩 이벤트는 ai_events에 넣으면 된다 | provider/model/pricing_version이 NOT NULL, 비용 집계 오염 | onboarding_events 신규 테이블 |
| 데모는 별도 테이블로 격리해야 안전하다 | sessions/messages/submissions/grades가 전부 exam_id FK | exams.is_demo 플래그. 승격도 한 줄 UPDATE |

## Technical Context

### 현행 구현 (코드 근거)
- `app/(app)/onboarding/page.tsx` — 역할선택→프로필 2단계. 저장이 `PATCH /api/user/profile` + `POST /api/{student|instructor}/profile` 이중 기록이며 두 번째는 `ok` 미확인(L192)
- `components/auth/CustomSignUp.tsx:20,31,58` — 가입 폼이 이미 role을 받아 auth metadata + localStorage 저장. `handleOAuth` 는 폼을 거치지 않음
- `app/api/user/profile/route.ts:47` — role=instructor면 status 자동 `pending`
- `app/(app)/instructor-pending/page.tsx` — questonkr@gmail.com 하드코딩, mailto로 소속·과목·목적을 적어 보내라 안내. "승인 확인"은 수동 새로고침
- `app/api/admin/instructors/pending/route.ts:15` — `id, name, email, created_at` 만 조회. **school 누락**
- `app/api/admin/instructors/approve/route.ts:48` — profiles 갱신 실패를 non-fatal 처리 → 두 테이블 불일치 가능
- `app/api/supa/handlers/exam-handlers.ts:714-785` — `duplicateExam` 이 문항·루브릭·가중치 복제 + 새 코드 발급. **데모 생성의 기존 자산**
- `app/api/supa/handlers/exam-handlers.ts:652` — `getExams` 가 instructor_id로 전체 조회. is_demo 필터 필요
- `lib/rate-limit.ts` — 인메모리 + Upstash. `RATE_LIMITS.ai` 가 chat/instructor-chat/generate-summary에 적용됨
- `database/create_ai_events_table.sql` — provider/model/pricing_version NOT NULL, 비용·토큰 중심 스키마
- `database/008_create_agent_runs_table.sql` — `type`, `actor_id` 형태의 이벤트 테이블 선례
- `sessions.used_clarifications`, `grades.stage_grading.chat` — clarification이 채점 대상임을 보여주는 근거
- 메일 발송 코드 부재. `docs/CODEX_DB_SAFETY.md` 는 존재하지 않는 파일이었음(AGENTS.md에서 인라인으로 대체 완료)

### DB 변경 (확정)
```sql
ALTER TABLE public.exams ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX idx_exams_instructor_demo ON public.exams (instructor_id, is_demo);

ALTER TABLE public.profiles ADD COLUMN plan text NOT NULL DEFAULT 'free';

CREATE TABLE public.onboarding_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  role        text        NOT NULL,
  event       text        NOT NULL,
  exam_id     uuid        REFERENCES public.exams(id) ON DELETE SET NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event)
);
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.onboarding_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
DDL은 `database/[NNN]_*.sql` 규칙을 따른다.

### 외부 근거
- 상위 25% SaaS: 활성화율 40%+, TTV 5분 미만. 가치 마일스톤 미달 신규 유저 98%가 2주 내 이탈
- 온보딩 마이크로서베이는 2~3문항이 정설. 문항 추가마다 완료율 10~15% 하락. 목적은 프로필 수집이 아니라 3~5개 경로 세그먼트
- 질문은 인구통계가 아니라 JTBD여야 함 (Canva "무엇을 디자인할 건가요?", Notion "어디에 쓸 건가요?")
- 폼 필드 수는 데이터가 갈리나(1필드 우세 vs 3필드 우세) 4필드부터 급락, 5~7 구간이 절벽인 점은 공통
- 대학생 54%가 시험·과제에서 AI 사용을 부정행위로 인식. 아니라는 응답 21%. 원인은 도구가 아니라 정책 모호성
- 저역량 학생일수록 AI 리스크를 크게 인식해 회피 → 우리 제품에선 저성과로 직결
- 처방은 감시 프레임이 아니라 투명성 프레임
- Gradescope는 고정 데모 코스를 기본 제공하고 "지우지 마세요"라 안내. Khanmigo는 별도 대시보드 없는 무마찰 첫 실행. Packback은 온보딩을 "학생을 데려오는 것"까지로 정의

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Instructor | core | name, email, school, status, plan | plan에 따라 발행 한도가 결정됨 |
| Student | core | student_id, school | captive — 교수자가 시켜야 진입 |
| Exam | core | code, type, published, is_demo | is_demo는 목록·통계·한도에서 제외 |
| PlanTier | core | plan, max_publishes=3, max_students=5, ai_demo_generation | 한도는 현재 상수, 후에 plan_limits로 |
| OnboardingEvent | core | user_id, role, event, exam_id, occurred_at | UNIQUE(user_id,event) 마일스톤 의미론 |
| DemoTemplate | core | type, subject_category, questions, rubric | duplicateExam으로 DemoRun 생성 |
| DemoRun | supporting | completed_at, source, graded_viewed_at | is_demo=true인 Exam |
| InstructorIntake | core | assess_target, subject | DemoTemplate 선택 입력 |
| StudentDisclosure | supporting | acknowledged_at | preflight에 부착 |
| NoticeTemplate | supporting | copyable_text, includes_exam_code, includes_ai_policy | 시험 상세 화면 복사 버튼 |
| EngagementGate | supporting | threshold=demo_completed | AI 데모 생성 개방 |
| AdminVisibility | supporting | new_instructors, publish_activity, ai_cost | read-only |
| VerificationRequest | supporting | triggered_by=quota_exceeded | 승인 = plan 승격 |
| LimitNotice | supporting | reason_text, tone=explanatory | 한도 도달 시 사유 명시 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 1 | 4 | 4 | - | - | baseline |
| 2 | 6 | 2 | 0 | 4 | 67% |
| 3 | 7 | 1 | 0 | 6 | 86% |
| 4 | 9 | 2 | 0 | 7 | 78% |
| 5 | 11 | 2 | 0 | 9 | 82% |
| 6 | 11 | 0 | 0 | 11 | 100% |
| 7 | 11 | 1 | 0 | 10 | 91% (PublishGate 제거) |
| 8 | 11 | 0 | 1 | 10 | 100% |
| 9 | 12 | 1 | 0 | 11 | 92% (PublishGate 복귀) |
| 10 | 13 | 2 | 0 | 11 | 85% |
| 11 | 14 | 2 | 0 | 12 | 86% |
| 12 | 14 | 0 | 0 | 14 | 100% |
| 13 | 14 | 0 | 0 | 14 | 100% |

3라운드 연속 신규 개념 0. 도메인 모델 수렴 확인.

## Interview Transcript

<details>
<summary>전체 Q&A (Round 0 + 13 rounds)</summary>

- **R0 토폴로지**: 5개 컴포넌트 + 10개 locked intent 확정. 변경·이월 없음.
- **R1 승인 게이트 목표**: 샌드박스 허용(생성·데모 즉시, 발행만 승인). 100%→72%
- **R2 액티베이션 정의**: 2단계 지표(즉시=데모 완주 / 진짜=첫 학생 제출). 72%→66%
- **R3 프로필 수집 시점**: 통합안 + 건너뛰기 허용. intake를 데모 생성 입력으로. 66%→54%
- **R4 학생 첫 진입**: 응시 전 3줄 고지 + 교수자용 공지 템플릿 둘 다. 54%→47%
- **R5 데모 생성 방식**: 템플릿 복제 시작 + 관여도 기반 AI 개방(CAC 관점, 현 MAU 규모에서 감당 가능). 47%→45%
- **R6 완주 기준**: 학생은 captive user라 완주율 무의미 → 학생 기준 재규정. 교수자 완주 = 학생 시점 1문항 답변 + AI 채점 열람. 45%→36%
- **R7 승인 SLA**: 승인 게이트 완전 제거(f1 철회). 36%→**46% 상승**
- **R8 사후 모니터링**: 관리자 가시성 조회 화면만. 강제 장치 제외. 46%→37%
- **R9 intake 재검토**: 발행에만 게이트 복귀(f14 철회). 가입 폼 미변경, 온보딩 현행 유지 + JTBD 2문항 추가. 37%→32%
- **R10 발행 게이트 형태**: 회의 결정 — 차단이 아니라 한도. 미인증 발행 3회, 학생 수 상한 병행(f16 철회). 32%→26%
- **R11 DB 구조**: exams.is_demo + onboarding_events + profiles.plan(한도는 상수). 회의 추가분 — 학생 5명, 안내문은 사유 설명 톤. 26%→23%
- **R12 공지 템플릿 형태**: 무응답 → 에이전트 결정(복사 텍스트만, 공유 링크 제외). 상한 적용. 23%→19%
- **R13 발행 카운트 기준**: 한번이라도 발행된 exam 로우 개수. 재발행 미산입. 19%→18%

</details>

## Intent Contract Coverage

Round 0에서 잠근 10개 항목 전부 유지. 축소·삭제 없음.

| Locked ID | 커버 위치 |
|-----------|-----------|
| `artifact:demo-exam` | f9, f20 / AC-5, AC-6, AC-17 — DemoTemplate 복제로 생성되는 is_demo=true exam |
| `artifact:activation-events` | f2, f20 / AC-7, AC-18 — onboarding_events 테이블과 마일스톤 이벤트 스키마 |
| `surface:signup-role-profile` | f5, f18 / AC-1~AC-4 — 역할 재질문 제거, 이중 기록 수정, 중복 경로 정리, JTBD 2문항 |
| `surface:instructor-first-run` | f9, f10, f12 / AC-5~AC-8 — 데모 생성·완주·AI 개방 |
| `surface:student-first-run` | f6, f11, f13, f23 / AC-14~AC-16 — preflight 3줄 고지, 공지문 복사 |
| `integration:instructor-approval` | f17, f19, f21, f24 / AC-9~AC-13 — 승인이 plan 승격으로 재정의됨. 기존 /api/admin/instructors/approve 경로 유지 |
| `integration:auth-profiles` | f18, f20 / AC-2, AC-13 — Clerk 인증 + profiles/instructor_profiles/student_profiles. profiles.plan 추가 |
| `constraint:i18n` | Constraints / AC-12 — 한도 안내문 포함 모든 문구 next-intl ko/en |
| `constraint:no-human-review` | Constraints — CI + impact-review가 유일한 머지 게이트. 인수조건은 전부 자동 검증 가능한 형태로 작성됨 |
| `constraint:one-sprint` | Non-Goals / Deferrals — plan_limits·이메일·공유링크·연습문항·LMS 전부 명시적 제외로 한 스프린트 범위 유지 |
