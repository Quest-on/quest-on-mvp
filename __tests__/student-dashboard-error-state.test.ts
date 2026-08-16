import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 학생 대시보드는 오류와 빈 상태를 구분해야 한다. (#241)
 *
 * 예전에는 `useInfiniteQuery` 에서 `isLoading` 만 꺼내 썼다. 세션 조회가
 * 실패하면 `isLoading` 이 false 가 되고 `allSessions` 가 빈 배열로 남아서
 * "아직 응시한 시험이 없습니다" 가 렌더됐다.
 *
 * 학생에게 이건 자기 응시 기록이 사라졌다는 뜻으로 읽힌다. 시험 플랫폼에서
 * 가장 하면 안 되는 거짓말이다.
 *
 * 소스 구조만 본다. 문자열 매칭으로 동작을 주장하지 않는다.
 */
const SOURCE = readFileSync(
  resolve(process.cwd(), "components/student/StudentDashboardClient.tsx"),
  "utf8"
);

describe("학생 대시보드 — 오류 상태", () => {
  it("세션 쿼리가 isError 와 refetch 를 꺼낸다", () => {
    expect(SOURCE).toMatch(/isError:\s*isSessionsError/);
    expect(SOURCE).toMatch(/refetch:\s*refetchSessions/);
  });

  it("빈 상태는 오류가 아닐 때만 렌더된다", () => {
    // 이 가드가 핵심이다. 오류 분기가 빈 상태보다 앞에 있어야 한다.
    //
    // `allSessions.length === 0` 는 로딩 분기에도 나온다
    // (`isSessionsLoading && allSessions.length === 0`). 빈 상태 분기만
    // 집어야 하므로 앞의 `) : ` 까지 포함해 찾는다.
    const errIdx = SOURCE.indexOf(") : isSessionsError ? (");
    const emptyIdx = SOURCE.indexOf(") : allSessions.length === 0 ? (");
    expect(errIdx, "isSessionsError 분기가 없다").toBeGreaterThan(-1);
    expect(emptyIdx, "빈 상태 분기가 없다").toBeGreaterThan(-1);
    expect(errIdx, "오류 분기가 빈 상태보다 뒤에 있으면 오류가 빈 상태로 샌다").toBeLessThan(emptyIdx);
  });

  it("기존 ErrorAlert 를 재사용한다", () => {
    // 화면마다 다른 오류 UI 를 만들면 사용자가 매번 새로 배워야 한다.
    expect(SOURCE).toMatch(/from "@\/components\/ui\/error-alert"/);
    expect(SOURCE).toMatch(/<ErrorAlert/);
  });

  it("오류 문구가 빈 상태 문구와 다르다", () => {
    expect(SOURCE).toMatch(/emptyState\.loadError/);
    expect(SOURCE).toMatch(/emptyState\.noExams/);
  });

  it("재시도가 refetch 를 부른다", () => {
    // 새로고침을 요구하면 스크롤 위치와 필터가 날아간다.
    expect(SOURCE).toMatch(/onRetry=\{\(\) => refetchSessions\(\)\}/);
  });
});
