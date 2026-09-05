/**
 * 데모 응시의 복귀 목적지와 과제형 분기 (에픽 #79 P1).
 *
 * 교수자가 자기 데모를 연습하고 나면 **학생 대시보드로 버려졌다.** 이탈·제출·
 * 자동제출·제출완료 5초 후까지 네 경로가 전부 `/student` 였다. 방금 뭘 한 건지,
 * 다음에 뭘 눌러야 하는지 알 수 없다 — 온보딩의 다음 단계(AI 재생성 개방 확인·
 * 다시 해보기)가 전부 데모 상세에 있다.
 *
 * 과제형은 만들 수는 있지만 겪을 수 없었다. intake 가 시험/과제를 묻는데 과제
 * 응시(`/assignment/{code}`)·완주 판정·제출 후 필수 quiz 는 시험과 완전히 다른
 * 흐름이고 `useAssignmentSession` 은 데모 미리보기를 모른다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("데모 응시의 복귀 목적지", () => {
  const page = read("app/(app)/exam/[code]/page.tsx");
  const hook = read("hooks/useExamSession.ts");

  it("훅이 서버 판정을 그대로 내보낸다", () => {
    // 클라이언트가 is_demo 를 스스로 판정하면 남의 데모·일반 시험까지
    // 이 경로를 탄다. 서버가 init 응답으로 준 값만 쓴다.
    expect(hook).toMatch(/demoPreview: initData\?\.ok === true && initData\.demoPreview === true/);
    expect(hook).toMatch(/demoExamId:/);
  });

  it("목적지를 한 곳에서 정한다", () => {
    expect(page).toMatch(/const exitDestination =/);
    expect(page).toMatch(/session\.demoPreview && session\.demoExamId/);
  });

  it("네 경로가 모두 그 목적지를 쓴다", () => {
    // 한 곳만 남아도 그 경로로 빠진다. 이탈 확인 / onExitConfirm /
    // onAutoSubmitExit / 제출완료 5초 후 — 전부다.
    const uses = page.match(/router\.push\(exitDestination\)/g) ?? [];
    expect(uses).toHaveLength(4);
    expect(page).not.toMatch(/router\.push\("\/student"\)/);
  });

  it("일반 학생은 여전히 학생 대시보드로 간다", () => {
    expect(page).toMatch(/: "\/student";/);
  });

  it("제출 완료 화면도 목적지를 전달받는다", () => {
    // 이 화면은 별도 컴포넌트라 prop 으로 넘기지 않으면 스코프 밖이다.
    expect(page).toMatch(/exitDestination=\{exitDestination\}/);
    expect(page).toMatch(/exitDestination: string;/);
  });
});

describe("과제형 데모 선택지", () => {
  const onboarding = read("app/(app)/onboarding/page.tsx");

  it("intake 가 평가 대상을 묻지 않는다", () => {
    // 겪을 수 없는 데모를 만드는 선택지를 보여주면 안 된다.
    expect(onboarding).not.toMatch(/setAssessTarget/);
    expect(onboarding).not.toMatch(/intakeAssessTarget_/);
  });

  it("데모 생성 요청에 평가 대상을 싣지 않는다", () => {
    expect(onboarding).not.toMatch(/\{ assessTarget, subject \}/);
    expect(onboarding).toMatch(/\{ subject \}/);
  });

  it("왜 뺐는지가 코드에 남아 있다", () => {
    // 이유가 없으면 다음 사람이 "빠졌네" 하고 되살린다.
    expect(onboarding).toMatch(/useAssignmentSession/);
  });
});
