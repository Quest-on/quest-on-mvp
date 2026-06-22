import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  detectAbnormalInputBursts,
  buildExternalPasteSuspicionDetails,
  type InputEvent,
} from "@/lib/answer-integrity";

describe("detectAbnormalInputBursts", () => {
  const baseTs = 1_700_000_000_000;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FINAL_ANSWER_SPEED_ANALYSIS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flags a single large insert without paste", () => {
    const events: InputEvent[] = [
      { ts: baseTs, kind: "insert", delta: 120, len: 120 },
    ];
    const bursts = detectAbnormalInputBursts(events);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].reason).toBe("single_burst");
    expect(bursts[0].chars).toBe(120);
  });

  it("ignores paste events", () => {
    const events: InputEvent[] = [
      {
        ts: baseTs,
        kind: "paste",
        delta: 500,
        len: 500,
        internal: false,
      },
    ];
    expect(detectAbnormalInputBursts(events)).toHaveLength(0);
  });

  it("flags aggressive high CPS window", () => {
    const events: InputEvent[] = [
      { ts: baseTs, kind: "insert", delta: 2, len: 2 },
      { ts: baseTs + 100, kind: "insert", delta: 2, len: 4 },
      { ts: baseTs + 200, kind: "insert", delta: 2, len: 6 },
    ];
    const bursts = detectAbnormalInputBursts(events);
    expect(bursts.some((b) => b.reason === "high_cps")).toBe(true);
  });

  it("builds external paste suspicion details with reason and preview", () => {
    const details = buildExternalPasteSuspicionDetails(
      [
        {
          length: 42,
          is_internal: false,
          suspicious: true,
          timestamp: "2026-06-11T02:00:00.000Z",
          pasted_text: "외부에서 가져온 긴 텍스트 예시",
          paste_start: 10,
        },
      ],
      "ko"
    );
    expect(details).toHaveLength(1);
    expect(details[0].reason).toContain("내부 복사 표식");
    expect(details[0].textPreview).toContain("외부에서");
    expect(details[0].pasteStart).toBe(10);
  });

  it("returns empty when feature flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_FINAL_ANSWER_SPEED_ANALYSIS", "false");
    const events: InputEvent[] = [
      { ts: baseTs, kind: "insert", delta: 200, len: 200 },
    ];
    expect(detectAbnormalInputBursts(events)).toHaveLength(0);
  });
});
