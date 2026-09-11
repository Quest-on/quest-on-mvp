import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { resolveExamDetailPhase } from "../lib/exam-detail-phase";

const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("시험 상세 단계 판정", () => {
  it("갓 만든 시험은 setup 이다", () => {
    expect(
      resolveExamDetailPhase({ status: "draft", studentCount: 0, studentsLoaded: true })
    ).toBe("setup");
  });

  it("학생이 한 명이라도 있으면 절대 setup 이 아니다", () => {
    // setup 은 검색·정렬·새로고침을 숨긴다. 학생이 있는데 숨기면 교수자가
    // 명단을 다룰 수단을 잃는다. status 가 무엇이든 이 규칙이 앞선다.
    for (const status of ["draft", "scheduled", "joinable", "running", "entry_closed"]) {
      expect(
        resolveExamDetailPhase({ status, studentCount: 1, studentsLoaded: true }),
        `${status} 에서 학생 1명이 setup 으로 떨어졌다`
      ).not.toBe("setup");
    }
  });

  it("진행 중이면 학생이 아직 0명이어도 live 다", () => {
    // 시작 직후 첫 학생이 들어오기 전 몇 초 동안 배포 화면으로 되돌아가면
    // 감독하러 온 교수자가 자기 화면이 초기화된 것으로 읽는다.
    expect(
      resolveExamDetailPhase({ status: "running", studentCount: 0, studentsLoaded: true })
    ).toBe("live");
    expect(
      resolveExamDetailPhase({ status: "entry_closed", studentCount: 0, studentsLoaded: true })
    ).toBe("live");
  });

  it("종료된 시험은 학생 수와 무관하게 review 다", () => {
    expect(
      resolveExamDetailPhase({ status: "closed", studentCount: 0, studentsLoaded: true })
    ).toBe("review");
    expect(
      resolveExamDetailPhase({ status: "closed", studentCount: 30, studentsLoaded: true })
    ).toBe("review");
  });

  it("학생 목록을 아직 못 받았으면 도구를 숨기지 않는다", () => {
    // 0명을 "없음"으로 믿으면 발행된 시험을 열 때마다 setup → live 로 튄다.
    expect(
      resolveExamDetailPhase({ status: "joinable", studentCount: 0, studentsLoaded: false })
    ).toBe("live");
    expect(
      resolveExamDetailPhase({ status: "scheduled", studentCount: 0, studentsLoaded: false })
    ).toBe("live");
  });

  it("draft 는 로딩 중에도 setup 이다 — 첫 화면이 흔들리면 안 된다", () => {
    expect(
      resolveExamDetailPhase({ status: "draft", studentCount: 0, studentsLoaded: false })
    ).toBe("setup");
  });

  it("알 수 없는 status 와 망가진 학생 수에도 판정한다", () => {
    expect(
      resolveExamDetailPhase({ status: null, studentCount: 0, studentsLoaded: true })
    ).toBe("setup");
    expect(
      resolveExamDetailPhase({ status: "weird", studentCount: Number.NaN, studentsLoaded: true })
    ).toBe("setup");
    expect(
      resolveExamDetailPhase({ status: "weird", studentCount: -5, studentsLoaded: true })
    ).toBe("setup");
  });
});

describe("단계 판정이 화면에 실제로 배선돼 있다", () => {
  const detail = read("app/(app)/instructor/[examId]/page.tsx");

  it("상세 페이지가 판정 함수를 쓴다", () => {
    // 화면 안에서 다시 계산하면 위 테스트가 아무것도 지키지 못한다.
    expect(detail).toMatch(/resolveExamDetailPhase\(/);
  });

  it("학생 목록 도구가 setup 에서만 사라진다", () => {
    // live/review 에서 숨으면 명단을 다룰 수 없다.
    expect(detail).toMatch(/phase !== "setup"/);
  });

  it("문항 fetch 가 아코디언 개폐에 걸려 있지 않다", () => {
    // 걸어 두면 펼칠 때마다 스피너부터 뜬다. 데이터는 이미 받아 놨다.
    expect(detail).not.toMatch(/questionsOpen \? examDetailData/);
  });
});
