import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const FORM = "components/instructor/SimpleExamAuthoringForm.tsx";
const DRIVE = "components/instructor/InstructorHomeClient.tsx";

describe("문제 유형 기본값", () => {
  it("사례형이 기본이다", () => {
    // 이 제품은 AI 와의 대화로 사고 과정을 평가하는 게 핵심이다.
    // 사지선다를 미리 골라 두면 그 차별점에서 멀어지는 쪽으로 유도한다.
    const src = read(FORM);
    expect(src, "사지선다가 기본이다").not.toMatch(
      /useState<Question\["type"\]>\("multiple-choice"\)/
    );
    // 사례형의 내부 값은 "essay" 다 (typeEssayLabel = 사례형).
    expect(src).toMatch(/useState<Question\["type"\]>\("essay"\)/);
  });
});

describe("시험 시간 입력", () => {
  const src = read(FORM);

  it("프리셋이 선택 상태를 들지 않는다", () => {
    // 숫자 입력과 칩이 같은 값을 동시에 칠하면 어느 쪽이 진짜인지 모른다.
    // Canvas 도 Moodle 도 프리셋 없이 숫자 하나만 받는다.
    expect(src, "칩이 duration 과 비교해 selected 를 칠한다").not.toMatch(
      /duration === value \? "default"/
    );
  });

  it("프리셋은 남는다 — 속도를 버리지 않는다", () => {
    // 중복을 없앤다고 빠른 길까지 없애면 손해다. 값을 바꾸는 동작으로 둔다.
    expect(src).toMatch(/\[30, 60, 90, 120\]\.map/);
  });

  it("숫자 입력이 값의 출처다", () => {
    expect(src).toMatch(/durationInput/);
  });

  it("무제한은 별도 모드다", () => {
    // 무제한은 같은 값의 중복 표시가 아니라 한도 자체를 끄는 다른 상태다.
    expect(src).toMatch(/isUnlimited/);
  });
});

describe("폴더 카드", () => {
  const src = read(DRIVE);

  it("안에 몇 개가 들었는지 보여준다", () => {
    // 실제 계정에 "새 폴더" 가 10개 있었다. 이름만으로는 구분이 안 된다.
    expect(src, "child_count 를 화면에 안 쓴다").toMatch(/drive\.folderItems/);
  });

  it("빈 폴더를 0개가 아니라 말로 알린다", () => {
    expect(src).toMatch(/drive\.folderEmpty/);
  });

  it("서버가 세어 보내는 값을 쓴다", () => {
    // 클라이언트에서 다시 세면 조회가 N 배로 늘어난다.
    expect(src).toMatch(/node\.child_count/);
  });

  it("두 언어에 문구가 있다", () => {
    for (const locale of ["ko", "en"]) {
      const d = JSON.parse(read(`messages/${locale}/instructor.json`)).drive;
      expect(d?.folderItems, `${locale}.drive.folderItems 없음`).toBeTruthy();
      expect(d?.folderEmpty, `${locale}.drive.folderEmpty 없음`).toBeTruthy();
    }
  });
});
