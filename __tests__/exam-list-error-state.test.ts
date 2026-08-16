import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 교수자 메인 대시보드의 시험 목록도 오류와 빈 상태를 구분해야 한다. (#241)
 *
 * 예전에는 `useInfiniteQuery` 에서 `isLoading` 만 꺼내 썼다. 목록 조회가
 * 실패하면 `filteredExamNodes` 가 빈 배열로 남아 "시험이 없습니다" 가 떴다.
 *
 * 교수자에게 이건 출제한 시험이 사라졌다는 뜻으로 읽힌다. 이 화면은
 * 교수자가 가장 자주 보는 곳이라 영향이 가장 크다.
 */
const SOURCE = readFileSync(
  resolve(process.cwd(), "components/instructor/InstructorHomeClient.tsx"),
  "utf8"
);

describe("교수자 시험 목록 — 오류 상태", () => {
  it("무한 쿼리가 isError 와 refetch 를 꺼낸다", () => {
    expect(SOURCE).toMatch(/isError:\s*isExamListError/);
    expect(SOURCE).toMatch(/refetch:\s*refetchExamList/);
  });

  it("오류 분기가 빈 상태보다 앞에 있다", () => {
    // 순서가 뒤집히면 오류가 다시 '시험이 없습니다' 로 샌다.
    const errIdx = SOURCE.indexOf("{isExamListError ? (");
    const listIdx = SOURCE.indexOf(") : filteredExamNodes.length > 0 ? (");
    expect(errIdx, "오류 분기가 없다").toBeGreaterThan(-1);
    expect(listIdx, "목록 분기가 오류 분기 뒤에 있지 않다").toBeGreaterThan(-1);
    expect(errIdx).toBeLessThan(listIdx);
  });

  it("기존 ErrorAlert 를 재사용한다", () => {
    expect(SOURCE).toMatch(/from "@\/components\/ui\/error-alert"/);
  });

  it("오류 문구가 빈 상태 문구와 다르다", () => {
    expect(SOURCE).toMatch(/drive\.loadError/);
    expect(SOURCE).toMatch(/drive\.noExams/);
  });

  it("재시도가 refetch 를 부른다", () => {
    expect(SOURCE).toMatch(/onRetry=\{\(\) => refetchExamList\(\)\}/);
  });
});
