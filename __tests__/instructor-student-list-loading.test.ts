import { describe, it, expect } from "vitest";
import { shouldShowStudentListSkeleton } from "@/lib/instructor-utils";

/**
 * 회귀: closed 시험은 학생 요약을 10초마다 폴링한다. 과거에는 로딩 판정에
 * React Query의 isFetching(백그라운드 재요청)이 포함돼, 폴링마다 목록이
 * 스켈레톤으로 교체되며 스크롤이 맨 위로 튀고 깜빡였다.
 * 이제 판정은 최초 로드(isLoading)에서만 true여야 한다.
 */
describe("shouldShowStudentListSkeleton", () => {
  it("시험 상세 최초 로딩 중에는 스켈레톤을 보여준다", () => {
    expect(
      shouldShowStudentListSkeleton({ examLoading: true, summariesLoading: false })
    ).toBe(true);
  });

  it("학생 요약 최초 로딩(isLoading) 중에는 스켈레톤을 보여준다", () => {
    expect(
      shouldShowStudentListSkeleton({ examLoading: false, summariesLoading: true })
    ).toBe(true);
  });

  it("데이터가 정착되면 스켈레톤을 숨긴다 — 백그라운드 폴링 재요청으로 목록을 교체하지 않는다", () => {
    // 폴링 재요청(isFetching)은 이 판정에 들어오지 않으므로 두 플래그 모두 false.
    expect(
      shouldShowStudentListSkeleton({ examLoading: false, summariesLoading: false })
    ).toBe(false);
  });
});
