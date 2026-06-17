/** Parse optional suggested score from assistant text (e.g. "추천 점수: 85"). */
export function parseSuggestedScoreFromText(text: string): number | null {
  const patterns = [
    /(?:추천\s*)?점수\s*[:：]\s*(\d{1,3})\s*(?:\/\s*100)?/i,
    /suggested\s+score\s*[:：]\s*(\d{1,3})\s*(?:\/\s*100)?/i,
    /(\d{1,3})\s*\/\s*100\s*점?/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const n = parseInt(match[1], 10);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}
