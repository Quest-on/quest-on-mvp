# Quest-On i18n 인벤토리 통합 요약

> 목적: 영문(en) 버전 추가를 위한 사전 조사 결과 집계. 6개 도메인 에이전트 + 1개 갭 보강 에이전트가 조사했고 opus가 교차검증(한글 포함 파일 전수 대조)했다.

## 1. 전체 규모

| 영역 | 파일(텍스트 보유) | 추출 문자열 | 인벤토리 |
|------|------|------|------|
| 01 랜딩/공개/법률 | 15 | ~464 | `inventory/01-landing-public-legal.md` |
| 02 인증/온보딩/프로필 | ~13 | ~191 | `inventory/02-auth-onboarding-profile.md` |
| 03 강사 대시보드/저작/네비 | ~35 | ~733 | `inventory/03-instructor-authoring-nav.md` |
| 04 강사 채점 | ~19 | ~350 | `inventory/04-instructor-grading.md` |
| 05 학생 응시/과제/퀴즈 | ~33 | ~400 | `inventory/05-student-exam-assignment.md` |
| 06 리포트/관리자/공유 | ~30 | ~344 | `inventory/06-report-admin-shared.md` |
| 07 특수페이지/lib | 11 | ~73 | `inventory/07-special-pages-lib.md` |
| **UI 합계** | **~156** | **~2,500** (테이블 행 기준; 중복·유사 포함) | |
| API 서버 에러 메시지 | 50 | ~165 리터럴 | (별도 결정) |

> 참고: 요약 숫자보다 각 인벤토리의 테이블 행 수가 더 많다(에이전트가 요약은 보수적으로 냈으나 표는 촘촘히 기재). 실제 고유 번역 문자열은 중복 제거 후 대략 1,300~1,600개로 추정.

## 2. 교차 관심사 (Cross-cutting)

### 2-1. 로케일 하드코딩 (`ko-KR`, `date-fns/locale ko`)
48개 파일에 분산. 영문화 시 **중앙 로케일에서 읽는 포맷 유틸로 교체 필수.**
- UI: `profile`, `student/report`, `admin/*`, `instructor/*` 편집·카드류, `report/*`
- 서버/lib: `exam-export*`, `bulk-grading*`, `assignment-quiz`, `grading-utils`, `prompts`
- 대표: `toLocaleDateString("ko-KR")`, `toLocaleString("ko-KR")`, `format(date, ..., { locale: ko })`

### 2-2. 보간·복수형 (dynamic)
`{n}명 / {n}개 / {n}분 / {n}점 / {n}자` 단위 후치 패턴이 60+ 개소.
- 영문은 단위가 앞/뒤 어순이 다르고 복수형 필요 → **ICU MessageFormat plural 필요.**
- 한국어 조사 의존: `{email}로`, `{role}(으)로`, `이(가)`, `을(를)` → 문장 구조 재설계 필요.

### 2-3. 한/영 혼재 & 브랜드 문자열 (결정 필요)
- 이미 영문: `No Credit Card Required`, `Instant Setup`, `AI-Powered`, `Total Score`, `All Systems Operational` 등 → ko 버전에서도 영문 유지할지 정책 필요.
- 데모/브랜드 콘텐츠: 랜딩 데모의 `그린휠`(가상 브랜드) 대화 예시 등 → 번역/유지 결정.
- admin: `hotspot`, `p95 latency`, `feature` 등 기술 용어 → 번역 정책.

### 2-4. AI 프롬프트 (`ai-prompt`)
`lib/prompts.ts` 등 AI에게 보내는 시스템 프롬프트의 한국어. **영문화 대상 아님(기본)** — 단, 영문 사용자에게 AI가 영어로 답하게 하려면 로케일별 프롬프트 분기 또는 "사용자 언어로 답하라" 지시가 필요. 별도 결정.

### 2-5. 서버(API) 에러 메시지
50개 라우트, ~165개 한글 리터럴이 JSON `error`/`message`로 반환→토스트로 노출.
- 옵션 A: 서버는 **에러 코드**만 반환, 클라이언트에서 번역(권장 — 로케일 서버 전파 불필요).
- 옵션 B: 서버가 `Accept-Language`/유저 pref로 현지화.
- 현재 `lib/error-messages.ts`에 상태코드/키 매핑(37개)이 이미 있어 A안과 궁합이 좋음.

### 2-6. 이메일 / 내보내기(Export)
- `not-found.tsx` mailto subject, 피드백 메일 등 한국어.
- `exam-export*`(xlsx/csv) 헤더가 한국어 → 내보내기 파일도 로케일 대상인지 결정.

## 3. 권장 아키텍처 (초안 — 계획 단계에서 확정)
- 라이브러리: **next-intl** (Next.js 16 App Router 네이티브, SSR/ICU/포맷 지원).
- 기본 언어: **ko**, 추가: **en**.
- 언어 저장: 비로그인=쿠키, 로그인=`app_users` 프로필 컬럼 + 쿠키 동기화. 헤더/설정에 언어 스위처.
- 라우팅: 결정 필요(URL prefix `/en` vs 쿠키 무프리픽스).
- 메시지 구조: 도메인별 네임스페이스 JSON (`messages/ko/*.json`, `messages/en/*.json`).

## 4. 조사 방법 메모
- 담당: `page.tsx`/`layout.tsx` 전수 + 텍스트 보유 컴포넌트 + 사용자 노출 lib + 특수 라우트(error/loading/not-found).
- 검증: 한글 포함 파일 263개 전수 대조 → 누락분(특수페이지·lib) 갭 에이전트로 보강 완료.
- 제외 확인: `sso-callback/page.tsx`(`return null`), `ui/`·`animate-ui/` 무텍스트 프리미티브, 순수 로직/주석.
