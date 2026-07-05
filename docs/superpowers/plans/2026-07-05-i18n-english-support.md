# Quest-On i18n (영문 버전) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국어 전용 UI에 영문(en) 버전을 next-intl로 추가하고, 모든 사용자 노출 UI를 로케일 인식 구조로 전환한다.

**Architecture:** next-intl(무프리픽스, 쿠키+`app_users.language`로 로케일 해석). 도메인 네임스페이스별 `messages/{ko,en}/*.json`. 날짜/숫자는 로케일 인식 포맷 유틸로 통일. 도메인별 phase로 병렬 이관.

**Tech Stack:** Next 16 App Router, React 19, TypeScript strict, next-intl, Vitest.

**참조:** spec `docs/superpowers/specs/2026-07-05-i18n-english-support-design.md`, 인벤토리 `docs/i18n/inventory/01~07-*.md`.

---

## 파일 구조 (신규/수정)

신규:
- `lib/i18n/config.ts` — `locales`, `defaultLocale`, `Locale` 타입, `isLocale()`.
- `lib/i18n/request.ts` — next-intl `getRequestConfig` (쿠키→유저→기본 해석 + 메시지 로드).
- `lib/i18n/locale.ts` — `resolveLocale()`(서버), `setLocale` 서버 액션(쿠키 + app_users 갱신).
- `lib/i18n/format.ts` — `formatDate/formatDateTime/formatNumber/formatRelative` 로케일 인식.
- `messages/ko/*.json`, `messages/en/*.json` — 네임스페이스별 메시지.
- `components/i18n/LanguageSwitcher.tsx` — 언어 스위처.
- `scripts/i18n/check-messages.ts` — ko/en 키 동일성 검사.
- `lib/i18n/__tests__/format.test.ts`, `lib/i18n/__tests__/config.test.ts`.

수정:
- `app/layout.tsx` — `NextIntlClientProvider` + `lang` 속성 로케일화.
- `next.config.ts` — `createNextIntlPlugin` 래핑.
- `lib/supabase-auth.ts` — `AppUser`에 `language` 노출.
- 헤더 컴포넌트(`PublicHeader`/`Header`/`UserMenu`) + `app/(app)/settings/page.tsx` — 스위처 배치.
- 인벤토리 대상 ~156개 파일 — 하드코딩 → `t()` 교체.

---

## Phase 0 — 인프라 (opus 직접 수행)

### Task 0.1: next-intl 설치 + 플러그인 배선

**Files:** Modify `package.json`, `next.config.ts`

- [ ] **Step 1: 설치**

Run: `npm install next-intl`
Expected: package.json에 `next-intl` 추가, 설치 성공.

- [ ] **Step 2: next.config 래핑**

`next.config.ts` 최상단에서 플러그인 생성 후 export 래핑:
```ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");
// 기존 export default nextConfig → export default withNextIntl(nextConfig);
```

- [ ] **Step 3: 빌드 로드 확인**

Run: `npx tsc --noEmit`
Expected: 신규 import 관련 에러 없음(request.ts는 다음 Task에서 생성하므로 이 스텝은 Task 0.3 이후 재확인).

### Task 0.2: 로케일 설정 + 테스트

**Files:** Create `lib/i18n/config.ts`, `lib/i18n/__tests__/config.test.ts`

- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { isLocale, defaultLocale, locales } from "../config";
describe("i18n config", () => {
  it("기본 로케일은 ko", () => expect(defaultLocale).toBe("ko"));
  it("ko/en 지원", () => expect(locales).toEqual(["ko", "en"]));
  it("isLocale 검증", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run lib/i18n/__tests__/config.test.ts` → FAIL (모듈 없음).

- [ ] **Step 3: 구현**
```ts
export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";
export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}
export const LOCALE_COOKIE = "NEXT_LOCALE";
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run lib/i18n/__tests__/config.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(i18n): 로케일 config + isLocale"`

### Task 0.3: 로케일 해석 + request config

**Files:** Create `lib/i18n/locale.ts`, `lib/i18n/request.ts`

- [ ] **Step 1: `locale.ts`** — 쿠키→유저→기본 해석 + 변경 서버 액션.
```ts
"use server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const user = await currentUser().catch(() => null);
  if (user && isLocale((user as { language?: string }).language)) {
    return (user as { language: Locale }).language;
  }
  return defaultLocale;
}

export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const user = await currentUser().catch(() => null);
  if (user?.id) {
    const supabase = await getSupabaseServer();
    await supabase.from("app_users").update({ language: locale }).eq("id", user.id);
  }
}
```
> 주의: `currentUser`/`getSupabaseServer` 실제 시그니처를 확인해 맞출 것(`lib/supabase-auth.ts`, `lib/supabase-server.ts`).

- [ ] **Step 2: `request.ts`**
```ts
import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./locale";

const namespaces = [
  "common","landing","legal","auth","onboarding","instructor",
  "authoring","grading","student","exam","assignment","report","admin","errors",
] as const;

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages: Record<string, unknown> = {};
  for (const ns of namespaces) {
    messages[ns] = (await import(`../../messages/${locale}/${ns}.json`)).default;
  }
  return { locale, messages };
});
```

- [ ] **Step 3: 빈 메시지 골격 생성** — `messages/{ko,en}/<ns>.json` 14개씩 `{}`로 생성(다음 phase에서 채움).
- [ ] **Step 4: typecheck** — Run: `npx tsc --noEmit` → 통과.
- [ ] **Step 5: Commit** — `git commit -m "feat(i18n): 로케일 해석 + request config + 메시지 골격"`

### Task 0.4: AppUser.language 노출

**Files:** Modify `lib/supabase-auth.ts`

- [ ] **Step 1:** `AppUser` 타입/조회 select에 `language: "ko" | "en"` 추가(기본 ko fallback). 실제 select 쿼리에 `language` 컬럼 포함.
- [ ] **Step 2: typecheck** → 통과.
- [ ] **Step 3: Commit** — `git commit -m "feat(i18n): AppUser에 language 노출"`

### Task 0.5: Provider 배선

**Files:** Modify `app/layout.tsx`

- [ ] **Step 1:** `NextIntlClientProvider`로 children 래핑, `<html lang={locale}>`에 로케일 적용.
```tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
// RootLayout 내부:
const locale = await getLocale();
const messages = await getMessages();
// <html lang={locale}> ... <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
```
> 기존 layout의 provider 중첩 순서 보존.

- [ ] **Step 2: 빌드** — Run: `npm run build` (또는 `npx tsc --noEmit` + dev 부팅 확인) → 통과.
- [ ] **Step 3: Commit** — `git commit -m "feat(i18n): NextIntlClientProvider 배선"`

### Task 0.6: 포맷 유틸 + 테스트

**Files:** Create `lib/i18n/format.ts`, `lib/i18n/__tests__/format.test.ts`

- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { formatDate, formatNumber } from "../format";
describe("i18n format", () => {
  const d = new Date("2026-01-02T03:04:00Z");
  it("ko 날짜", () => expect(formatDate(d, "ko")).toMatch(/2026/));
  it("en 날짜", () => expect(formatDate(d, "en")).toMatch(/2026/));
  it("숫자 로케일", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "ko")).toBe("1,234.5");
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — `Intl.DateTimeFormat`/`Intl.NumberFormat` 기반, 로케일 매핑(`ko`→`ko-KR`, `en`→`en-US`). 옵션 프리셋(date/dateTime/time).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(i18n): 로케일 인식 포맷 유틸"`

### Task 0.7: 언어 스위처 + 배치

**Files:** Create `components/i18n/LanguageSwitcher.tsx`; Modify `PublicHeader.tsx`, `components/auth/UserMenu.tsx`(또는 Header), `app/(app)/settings/page.tsx`

- [ ] **Step 1:** 스위처 컴포넌트 — 현재 로케일 표시, 클릭 시 `setLocale` 서버 액션 호출 후 `router.refresh()`.
- [ ] **Step 2:** 공개 헤더 + 유저 메뉴 + 설정 페이지에 배치.
- [ ] **Step 3: typecheck/lint** → 통과.
- [ ] **Step 4: Commit** — `git commit -m "feat(i18n): 언어 스위처 + 헤더/설정 배치"`

### Task 0.8: 키 동일성 검사 스크립트

**Files:** Create `scripts/i18n/check-messages.ts`

- [ ] **Step 1:** ko/en 각 네임스페이스 JSON을 재귀 평탄화해 키 세트 비교, 누락 시 비영점 종료.
- [ ] **Step 2:** Run: `npx tsx scripts/i18n/check-messages.ts` → (빈 골격 단계) PASS.
- [ ] **Step 3: Commit** — `git commit -m "chore(i18n): ko/en 키 동일성 검사 스크립트"`

**P0 완료 게이트(opus):** `npx tsc --noEmit` + `npm run lint` + dev 부팅 시 en/ko 전환 동작 확인.

---

## Phase 1~5 — 도메인 이관 (병렬 반복 프로토콜)

각 phase는 동일한 3단계 프로토콜을 따른다. `<NS>`=네임스페이스, `<INV>`=해당 인벤토리 파일.

| Phase | 네임스페이스 | 인벤토리 | 대상 |
|------|------|------|------|
| P1 | `landing, legal, common` | 01 | 랜딩/법률/공개 헤더/푸터 |
| P2 | `auth, onboarding, common` + lib | 02, 07 | 인증/온보딩/프로필/설정, 특수페이지, 사용자노출 lib |
| P3 | `instructor, authoring, common` | 03 | 강사 대시보드/저작/사이드바/네비 |
| P4 | `grading, common` | 04 | 강사 채점 |
| P5 | `student, exam, assignment, report, admin` | 05, 06 | 학생 응시/과제/리포트/관리자 |

### 프로토콜 (phase마다)

- [ ] **단계 A — 이관 에이전트(sonnet) dispatch:**
  담당 파일 목록(인벤토리의 `###` 경로)과 규칙을 준다:
  - 각 하드코딩 문자열을 `useTranslations("<NS>")`의 `t("key")`(서버 컴포넌트는 `getTranslations`)로 교체.
  - 키는 `namespace.section.element` 컨벤션, **원문 한국어를 `messages/ko/<NS>.json`에 등록**.
  - 보간은 `t("key", { count })` + ICU 복수형. 조사 의존 문자열은 문장 재작성.
  - `toLocaleDateString("ko-KR")`·`date-fns ko` → `lib/i18n/format.ts` 유틸로 교체.
  - **로직·마크업 구조·className 불변.** AI 프롬프트 문자열·데모 브랜드 콘텐츠는 건드리지 않음.
  - 산출: 교체된 파일 + `messages/ko/<NS>.json` 채움 + 변경 요약.

- [ ] **단계 B — UX writer 에이전트(sonnet) dispatch:**
  `messages/ko/<NS>.json`을 입력으로 `messages/en/<NS>.json` 작성:
  - 제품 UI 톤(간결·명확·행동 유도). 직역 금지, 자연스러운 en.
  - 용어 일관성: `docs/i18n/glossary.md`(P1에서 생성)의 표준 용어 준수·확장(예: 시험=Exam, 과제=Assignment, 채점=Grading, 문항=Question, 응시=Take, 강사=Instructor).
  - 복수형 ICU 유지, 플레이스홀더/변수명 보존.
  - 산출: `messages/en/<NS>.json` + 용어 사전 갱신 + 번역 노트.

- [ ] **단계 C — opus 검수:**
  - `npx tsx scripts/i18n/check-messages.ts` → ko/en 키 일치.
  - 담당 파일에 잔여 한글 하드코딩 grep: `grep -rlP '[\x{AC00}-\x{D7A3}]' <파일들>` → 주석·AI프롬프트·데모 외 없어야 함.
  - `npx tsc --noEmit` + `npm run lint` 통과.
  - en 문구 스팟체크(오역·톤·용어 일관성). 문제 시 해당 에이전트에 SendMessage로 반려.
  - phase 커밋: `git commit -m "feat(i18n): <phase> 영문화"`.

---

## Phase 6 — 마감 & QA (opus)

- [ ] **Step 1: 잔여 스윕** — 전 코드 `ko-KR`·한글 하드코딩 grep, 누락분 처리.
- [ ] **Step 2: 전수 검사** — `npx tsx scripts/i18n/check-messages.ts`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 모두 통과.
- [ ] **Step 3: 수동 QA** — dev에서 en 전환 후 강사(대시보드→저작→채점)·학생(응시→리포트) 주요 플로우 확인. 필요 시 스크린샷.
- [ ] **Step 4: 최종 커밋 + PR** — `gh pr create`.

---

## Self-Review 체크
- 스펙 커버리지: 로케일 방식(P0.3), 저장(P0.3/0.4), 메시지 구조(P0.3 + P1-5), 포맷(P0.6), 스위처(P0.7), 키검사(P0.8), 전 도메인(P1-5), QA(P6) — 모두 태스크 존재.
- 범위 밖(서버메시지·export·이메일)은 명시적으로 제외.
- 타입 일관성: `Locale`·`isLocale`·`resolveLocale`·`setLocale`·`formatDate` 명칭 전 태스크 통일.
