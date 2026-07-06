import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ExamDetailHeader "async Client Component" 크래시 회귀 가드.
 *
 * 버그: ExamDetailHeader 가 async 함수 + next-intl/server 의 getTranslations 를 쓰는데,
 * 이 컴포넌트는 client 페이지(app/(app)/instructor/[examId]/page.tsx, "use client") 안에서
 * 렌더된다. client 트리의 컴포넌트는 async 일 수 없고 서버 전용 getTranslations 도 쓸 수 없어,
 * instructor exam-detail 페이지가 dev·prod 양쪽에서 런타임 크래시했다
 * ("<ExamDetailHeader> is an async Client Component" / "getTranslations is not supported in
 * Client Components"). 이 테스트는 해당 컴포넌트가 client 훅 기반임을 잠근다.
 */
const HEADER = "components/instructor/ExamDetailHeader.tsx";
const PAGE = "app/(app)/instructor/[examId]/page.tsx";

function read(rel: string): string {
  return readFileSync(path.join(path.resolve(__dirname, ".."), rel), "utf8");
}

describe("ExamDetailHeader — client 컴포넌트 회귀 가드", () => {
  const src = read(HEADER);

  it("'use client' 지시문을 가진다", () => {
    expect(/^\s*["']use client["']/.test(src)).toBe(true);
  });

  it("async 컴포넌트가 아니다", () => {
    expect(/export\s+async\s+function\s+ExamDetailHeader/.test(src)).toBe(false);
  });

  it("서버 전용 next-intl/server(getTranslations)를 import/호출하지 않는다", () => {
    // 주석 언급이 아니라 실제 import 문 / await 호출만 검사한다.
    expect(/from\s+["']next-intl\/server["']/.test(src)).toBe(false);
    expect(/\bawait\s+getTranslations\b/.test(src)).toBe(false);
  });

  it("client 훅 useTranslations 를 쓴다", () => {
    expect(/useTranslations\s*\(\s*["']authoring["']\s*\)/.test(src)).toBe(true);
  });

  it("렌더 부모(instructor exam-detail 페이지)는 여전히 client 컴포넌트다", () => {
    // 부모가 client 인 한 이 헤더도 client 여야 한다는 전제를 문서화/고정한다.
    expect(/^\s*["']use client["']/.test(read(PAGE))).toBe(true);
  });
});
