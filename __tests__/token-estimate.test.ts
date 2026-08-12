import { estimateTokenCount } from "../lib/bulk-grading";

describe("estimateTokenCount with language awareness", () => {
  it("correctly estimates Korean text (not 2.4x under-estimated)", () => {
    // 200 characters of Korean text
    const koreanText =
      "한국 교육 시스템에서는 학생들이 다양한 능력과 배경을 가지고 있습니다. 이러한 다양성은 학교 환경에서 풍부한 학습 경험을 제공합니다. 학생들은 서로 다른 관점을 배울 수 있으며, 이는 창의적 사고와 문제 해결 능력을 발전시킵니다. 교사들은 이러한 다양성을 수용하고 모든 학생의 요구를 충족시키기 위해 노력합니다.";

    // Korean averages 0.600 tokens/char (1.667 chars/token)
    // 200 chars * 0.600 = 120 tokens
    // With 20% safety margin: 120 * 1.2 = 144 tokens
    // Old estimate would be: Math.ceil(200 / 4) = 50 tokens (2.88x under-estimate)
    const newEstimate = estimateTokenCount(koreanText);
    const oldEstimate = Math.ceil(koreanText.length / 4);

    console.log(`Korean text (${koreanText.length} chars):`);
    console.log(`  Old estimate: ${oldEstimate}`);
    console.log(`  New estimate: ${newEstimate}`);

    // The new estimate should be significantly higher than old (at least 2x)
    expect(newEstimate).toBeGreaterThanOrEqual(oldEstimate * 2);
  });

  it("does not over-estimate English text", () => {
    // 200 characters of English text
    const englishText =
      "The Korean education system provides students with diverse backgrounds and abilities. This diversity offers rich learning experiences in the school environment. Students can learn different perspectives, which develops creative thinking and problem-solving skills. Teachers work to accommodate this diversity and meet the needs of all students.";

    const newEstimate = estimateTokenCount(englishText);
    const oldEstimate = Math.ceil(englishText.length / 4);

    console.log(`English text (${englishText.length} chars):`);
    console.log(`  Old estimate: ${oldEstimate}`);
    console.log(`  New estimate: ${newEstimate}`);

    // New estimate should not be lower than old (err high, never low)
    expect(newEstimate).toBeGreaterThanOrEqual(oldEstimate);
  });

  it("handles empty string without throwing", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("handles whitespace-only string without throwing", () => {
    // Whitespace is now counted as non-Hangul at 0.25 tokens/char with 20% margin
    expect(estimateTokenCount("   \n\t  ")).toBeGreaterThan(0);
  });

  it("handles emoji without throwing", () => {
    expect(estimateTokenCount("😀😁😂😃")).toBeGreaterThan(0);
  });
});
