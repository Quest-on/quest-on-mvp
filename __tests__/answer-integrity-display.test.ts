import { describe, expect, it } from "vitest";
import {
  getAuthenticityScoreBand,
  humanizeIntegrityText,
  formatScoreRangeLegend,
} from "@/lib/answer-integrity-display";

describe("answer-integrity-display", () => {
  it("maps score to review bands", () => {
    expect(getAuthenticityScoreBand(24).classification).toBe("우선 검토 필요");
    expect(getAuthenticityScoreBand(24).reviewRecommended).toBe(true);
    expect(getAuthenticityScoreBand(95).classification).toBe("정상");
    expect(getAuthenticityScoreBand(75).classification).toBe("낮은 검토 필요");
    expect(getAuthenticityScoreBand(55).classification).toBe("검토 권장");
  });

  it("humanizes snake_case metric names", () => {
    const raw =
      "paste_to_final_answer_similarity_max 1, chars_inserted 0, edit_event_count 0";
    const out = humanizeIntegrityText(raw);
    expect(out).toContain("붙여넣은 내용과 최종 답안의 일치도");
    expect(out).toContain("100%");
    expect(out).not.toContain("paste_to_final_answer_similarity_max");
    expect(out).not.toContain("chars_inserted");
  });

  it("includes all score ranges in legend", () => {
    expect(formatScoreRangeLegend()).toContain("0~39");
    expect(formatScoreRangeLegend()).toContain("90~100");
  });
});
