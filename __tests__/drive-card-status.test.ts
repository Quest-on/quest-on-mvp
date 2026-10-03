import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  resolveDriveCardStatus,
  type DriveCardExam,
  type DriveCardStatus,
} from "../lib/drive-card-status";

const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const NOW = Date.parse("2026-10-06T10:00:00+09:00");
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

/** 배지 문구 키와 필터만 뽑아 표처럼 비교한다. */
const summarize = (s: DriveCardStatus) => ({ label: s.badge?.labelKey ?? null, filter: s.filter });
const exam = (status: string | null | undefined) =>
  summarize(resolveDriveCardStatus({ type: "exam", status }, NOW));

// "constructor" 는 판정을 객체 조회(MAP[status])로 바꿨을 때 프로토타입 값이 새는 걸 잡는다.
const PRE_START_OR_UNKNOWN = ["draft", "scheduled", "joinable", null, undefined, "", "weird_v2", "constructor"];

/** 판정이 낼 수 있는 경우를 하나씩. 배지·필터 일관성과 메시지 키 검사에 쓴다. */
const ALL_CASES: DriveCardExam[] = [
  ...["running", "entry_closed", "closed", "archived", "active", "completed"].map((status) => ({
    type: "exam",
    status,
  })),
  ...PRE_START_OR_UNKNOWN.map((status) => ({ type: "exam", status })),
  { type: "report", status: "draft", deadline: iso(NOW + HOUR) },
  { type: "report", status: "draft", deadline: iso(NOW - HOUR) },
  { type: "report", status: "draft", deadline: iso(NOW + 2 * HOUR), open_at: iso(NOW + HOUR) },
];

describe("교수 홈 시험 카드의 상태 판정 (#567)", () => {
  it("시작한 시험은 '진행 중'이고 진행 중 필터에 잡힌다", () => {
    // 예전에는 이 카드에 "완료"가 떴고 진행 중 필터에도 없었다. 교수가 시험을
    // 시작하자마자 끝난 것으로 읽었다.
    expect(exam("running")).toEqual({ label: "drive.statusInProgress", filter: "in-progress" });
  });

  it("종료한 시험은 '마감됨'이고 마감 필터에 잡힌다", () => {
    expect(exam("closed")).toEqual({ label: "drive.statusDeadlinePassed", filter: "deadline" });
  });

  it.each([
    // status        배지 문구 키                    필터
    ["entry_closed", "drive.statusInProgress", "in-progress"],
    ["archived", "drive.statusArchived", "deadline"],
    // 레거시 값은 예전 뜻대로 읽는다.
    ["active", "drive.statusInProgress", "in-progress"],
    ["completed", "drive.statusDeadlinePassed", "deadline"],
  ])("%s → 배지 %s, 필터 %s", (status, label, filter) => {
    expect(exam(status)).toEqual({ label, filter });
  });

  it.each(PRE_START_OR_UNKNOWN)("시작 전이거나 모르는 status(%s)는 배지도 필터도 없다", (status) => {
    // 모르는 값을 "완료"로 떨어뜨리던 것이 #567 의 원인이었다.
    expect(exam(status)).toEqual({ label: null, filter: null });
  });

  it("type 이 비어 있는 옛 시험도 시험으로 본다", () => {
    expect(summarize(resolveDriveCardStatus({ type: null, status: "running" }, NOW))).toEqual({
      label: "drive.statusInProgress",
      filter: "in-progress",
    });
    expect(summarize(resolveDriveCardStatus({ status: "closed" }, NOW)).filter).toBe("deadline");
  });

  it("시험은 마감일이 아니라 status 로 판정한다", () => {
    // 시험이 끝나는 때는 교수가 종료를 누르는 순간이다. 마감일 칸이 채워져 있어도 따르지 않는다.
    expect(
      resolveDriveCardStatus({ type: "exam", status: "running", deadline: iso(NOW - HOUR) }, NOW).filter
    ).toBe("in-progress");
    expect(
      resolveDriveCardStatus({ type: "exam", status: "draft", deadline: iso(NOW + HOUR) }, NOW).filter
    ).toBeNull();
  });

  it("exams 가 없는 노드는 배지도 필터도 없다", () => {
    expect(resolveDriveCardStatus(null, NOW)).toEqual({ badge: null, filter: null });
    expect(resolveDriveCardStatus(undefined, NOW)).toEqual({ badge: null, filter: null });
  });
});

describe("과제 카드는 지금처럼 기간으로 판정한다", () => {
  const assignment = (fields: DriveCardExam) =>
    summarize(resolveDriveCardStatus({ type: "report", status: "draft", ...fields }, NOW));

  it("마감 전이면 '활성'이고 진행 중 필터에 잡힌다", () => {
    expect(assignment({ deadline: iso(NOW + HOUR) })).toEqual({
      label: "drive.statusActive",
      filter: "in-progress",
    });
  });

  it("마감 시각 정각까지는 마감 전이다", () => {
    expect(assignment({ deadline: iso(NOW) }).filter).toBe("in-progress");
  });

  it("마감이 지나면 '마감됨'이고 마감 필터에 잡힌다", () => {
    expect(assignment({ deadline: iso(NOW - HOUR) })).toEqual({
      label: "drive.statusDeadlinePassed",
      filter: "deadline",
    });
  });

  it("공개 전이면 '예정'이고 진행 중 필터에는 없다", () => {
    expect(assignment({ deadline: iso(NOW + 2 * HOUR), open_at: iso(NOW + HOUR) })).toEqual({
      label: "drive.statusScheduled",
      filter: null,
    });
  });

  it("과제는 status 를 보지 않는다", () => {
    // 과제에는 시작·종료 버튼이 없어서 status 가 기간을 말해 주지 않는다.
    for (const status of ["running", "closed", "archived", "active", "completed"]) {
      expect(assignment({ status, deadline: iso(NOW + HOUR) }).filter, status).toBe("in-progress");
      expect(assignment({ status, deadline: iso(NOW - HOUR) }).filter, status).toBe("deadline");
    }
  });
});

describe("배지와 필터가 갈라지지 않는다", () => {
  it("같은 배지 문구는 언제나 같은 필터로 간다", () => {
    // 카드에 "마감됨"이 붙었는데 마감 필터에 없거나, "진행 중"이 붙었는데 진행 중
    // 필터에 없으면 교수는 어느 쪽도 믿지 못한다.
    const filterByLabel = new Map<string, DriveCardStatus["filter"]>();
    for (const input of ALL_CASES) {
      const { badge, filter } = resolveDriveCardStatus(input, NOW);
      if (!badge) {
        expect(filter, JSON.stringify(input)).toBeNull();
        continue;
      }
      if (filterByLabel.has(badge.labelKey)) {
        expect(filter, JSON.stringify(input)).toBe(filterByLabel.get(badge.labelKey));
      }
      filterByLabel.set(badge.labelKey, filter);
    }
  });
});

describe("배지 문구가 ko·en 메시지에 있다", () => {
  const ko = JSON.parse(read("messages/ko/instructor.json"));
  const en = JSON.parse(read("messages/en/instructor.json"));
  const lookup = (messages: unknown, key: string) =>
    key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);

  it("판정이 내는 모든 배지 키가 두 언어에 다 있다", () => {
    const keys = new Set(
      ALL_CASES.map((input) => resolveDriveCardStatus(input, NOW).badge?.labelKey).filter(
        (key): key is string => Boolean(key)
      )
    );
    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof lookup(ko, key), `ko ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("진행 중 시험 배지는 '진행 중' 필터 칩과 같은 말이다", () => {
    // 진행 중 필터를 누르면 나오는 시험 카드에 같은 말이 붙어 있어야 한다.
    const key = resolveDriveCardStatus({ type: "exam", status: "running" }, NOW).badge?.labelKey ?? "";
    expect(lookup(ko, key)).toBe(lookup(ko, "drive.filterInProgress"));
    expect(lookup(en, key)).toBe(lookup(en, "drive.filterInProgress"));
  });
});

describe("교수 홈이 판정 함수를 실제로 쓴다", () => {
  const home = read("components/instructor/InstructorHomeClient.tsx");

  it("카드 배지와 필터가 판정 함수를 부른다", () => {
    expect((home.match(/resolveDriveCardStatus\(/g) ?? []).length).toBeGreaterThan(0);
  });

  it("화면이 exams.status 를 직접 해석하지 않는다", () => {
    // 화면 안에서 다시 읽기 시작하면 배지와 필터가 또 갈라진다. #567 이 그렇게 생겼다.
    const lines = home.split("\n");
    const offenders = lines
      .map((line, i) => `${i + 1}: ${line.trim()}`)
      .filter((_, i) => /exams\??\.status\b/.test(lines[i]));
    expect(offenders).toEqual([]);
  });
});
