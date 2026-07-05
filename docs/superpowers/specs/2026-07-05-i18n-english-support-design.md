# Quest-On i18n (영문 버전) 설계 spec

- 날짜: 2026-07-05
- 브랜치: `feat/i18n-english`
- 조사 산출물: `docs/i18n/INVENTORY_SUMMARY.md` + `docs/i18n/inventory/01~07-*.md`

## 목표
한국어 전용 UI에 영문(en) 버전을 추가한다. 사용자(강사/학생/관리자)가 접근하는 **모든 UI 화면**을 로케일 인식 구조로 전환한다. API 서버 에러 메시지 현지화는 이번 범위 밖(후속 PR).

## 확정된 결정 (사용자 승인)
1. **로케일 방식**: 쿠키 기반, URL 무프리픽스. 로케일을 `NEXT_LOCALE` 쿠키에 저장(1년).
   - **정정(2026-07-05)**: 최초 계획은 `app_users.language`에 함께 저장하려 했으나, 조사 결과 유저 레벨 `language` 컬럼은 존재하지 않음(라인 69의 `language`는 `exams` 모델 소속, 런타임 유저 테이블은 Supabase Auth 관리 `profiles`). 실 auth DB 변경은 위험하므로 **v1은 쿠키 전용 영속화**(기기별, 스위처 완전 동작). 기기 간 동기화(DB 저장)는 후속 PR로 분리, 실행 않는 마이그레이션 SQL(`database/[NNN]_profiles_add_language.sql`)만 준비.
2. **이번 PR 범위**: i18n 인프라 + 전체 UI 문자열 영문화. API 50개 라우트 서버 에러 메시지는 후속 PR.
3. **AI/브랜드**: AI 튜터·채점은 유저 언어로 응답(프롬프트에 언어 지시 전달, 프롬프트 자체는 번역 안 함). 랜딩 데모/가상 브랜드 콘텐츠('그린휠' 등)는 원문 유지.

## 아키텍처

### 라이브러리
- **next-intl** (Next 16 App Router 네이티브). ICU MessageFormat, 복수형, 로케일 날짜/숫자 포맷 내장.
- **i18n 라우팅 미사용 모드**(무프리픽스): `i18n/request.ts`의 `getRequestConfig`에서 로케일을 쿠키/유저설정으로 해석. 별도 미들웨어 불필요.

### 로케일 해석 우선순위
1. `NEXT_LOCALE` 쿠키
2. (로그인) `app_users.language`
3. 기본값 `ko`

언어 스위처는 쿠키를 설정하고, 로그인 유저는 서버 액션으로 `app_users.language`도 갱신(기기 간 동기화). 지원 로케일: `["ko","en"]`.

### app_users.language 재사용
- 컬럼이 이미 존재(`prisma/schema.prisma:69`, `@default("ko")`, 현재 읽는 코드 없음). **DB 마이그레이션 불필요.**
- 의미를 "유저 선호 언어(UI + AI 응답)"로 승격. `AppUser` 타입(`lib/supabase-auth.ts`)에 `language: "ko"|"en"` 노출 추가.
- exam.language(시험별 AI 언어)·code language(python 등)와는 별개 개념 — 혼동 금지.

### 메시지 구조
- `messages/ko/<namespace>.json`, `messages/en/<namespace>.json`.
- 네임스페이스: `common, landing, legal, auth, onboarding, instructor, authoring, grading, student, exam, assignment, report, admin, errors`.
- 키 컨벤션: `namespace.section.element` (예: `authoring.questionEditor.addOptionButton`).
- 보간/복수형: ICU. 한국어 조사 의존 문자열(`{email}로`, `이(가)`, `을(를)`)은 문장 단위로 재작성.
- ko/en 키 세트 동일성 CI 검사 스크립트(`scripts/i18n/check-messages.ts`).

### 로케일 인프라 유틸
- `lib/i18n/config.ts`: `locales`, `defaultLocale`, `Locale` 타입.
- `lib/i18n/format.ts`: 로케일 인식 날짜/숫자/상대시간 포맷 유틸. 기존 `toLocaleDateString("ko-KR")`·`date-fns ko`(48개 파일)을 이걸로 교체.
- `lib/i18n/locale.ts`: 서버에서 현재 로케일 해석(쿠키→유저), 언어 변경 서버 액션.
- 언어 스위처 컴포넌트: `PublicHeader`/`Header`/유저메뉴 + `settings` 페이지에 배치.

## 실행 계획 (Phase)
각 phase는 sonnet 서브에이전트가 병렬 수행하고 phase 종료마다 opus가 검수한다.

- **P0 인프라 (opus 직접 + 검증)**: next-intl 설치, `i18n/request.ts`, `app/layout.tsx`에 `NextIntlClientProvider` 연결, `lib/i18n/*`, 언어 스위처, `app_users.language` read/write, 네임스페이스 골격, ko 메시지에 기존 한국어 이관 착수, 키 동일성 검사 스크립트.
- **P1 랜딩/법률/공개**: 인벤토리 01.
- **P2 인증/온보딩/프로필/설정**: 인벤토리 02 + 07(특수페이지/lib 일부).
- **P3 강사 대시보드/저작/네비**: 인벤토리 03.
- **P4 강사 채점**: 인벤토리 04.
- **P5 학생 응시/과제/리포트/관리자**: 인벤토리 05 + 06.

각 도메인 phase 구성:
1. **이관(migration) 에이전트(sonnet)**: 하드코딩 문자열을 `t()` 호출로 교체하고 ko 메시지 JSON에 키 등록. 로직·마크업 불변.
2. **UX writer 에이전트(sonnet)**: ko 메시지를 자연스러운 en으로 번역. 제품 UI 톤(간결·명확), 용어 일관성 사전 유지, 복수형/어순 처리.
3. **opus 검수**: 키 누락·오역·미교체 하드코딩·typecheck/lint 확인.

- **P6 마감**: 잔여 `ko-KR`/하드코딩 전수 스윕, en 전수 QA, `npx tsc --noEmit` + `npm run lint` + `npm run build`, 주요 플로우 스크린샷 대조.

## 테스트/검증
- 유닛(Vitest): `lib/i18n/format.ts` 로케일 분기, 로케일 해석 우선순위.
- 정합성: ko/en 키 세트 동일성 스크립트 → CI 실패 게이트.
- 수동: 언어 스위처로 en 전환 후 강사/학생 주요 플로우 확인.
- 완료 게이트(CLAUDE.md): typecheck + lint 필수, build 통과.

## 범위 밖 (후속 PR)
- API 50개 라우트(~165개 한글 리터럴) 서버 에러 메시지 error-code화 + 클라이언트 번역.
- exam-export(xlsx/csv) 파일 헤더 로케일화.
- 이메일 템플릿(mailto subject 등) 로케일화.

## 리스크
- 대규모 diff(~156 파일). 도메인 phase 분할 + phase별 typecheck로 완화.
- 한국어 조사 의존 문자열의 어색한 en 변환 → UX writer 전담 + 문장 재작성.
- next-intl 무프리픽스 모드 SSR 로케일 전달 정확성 → P0에서 최소 경로 먼저 검증 후 확장.
