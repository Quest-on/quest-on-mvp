import { describe, it, expect } from "vitest";
import {
  resolveObjectiveOrder,
  objectiveKeyToOptionValue,
} from "@/lib/objective-key-select";

// ---------------------------------------------------------------------------
// resolveObjectiveOrder
// ---------------------------------------------------------------------------

describe("resolveObjectiveOrder", () => {
  it("returns displayOrder for multiple-choice when lengths match", () => {
    expect(resolveObjectiveOrder("multiple-choice", 4, [2, 0, 3, 1])).toEqual([
      2, 0, 3, 1,
    ]);
  });

  it("falls back to identity when displayOrder is undefined", () => {
    expect(resolveObjectiveOrder("multiple-choice", 4, undefined)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("falls back to identity when displayOrder length mismatches", () => {
    // 3-element order for 4 options → mismatch
    expect(resolveObjectiveOrder("multiple-choice", 4, [1, 0, 2])).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("always returns identity for true-false even if displayOrder is passed", () => {
    expect(resolveObjectiveOrder("true-false", 2, [1, 0])).toEqual([0, 1]);
    expect(resolveObjectiveOrder("true-false", 2, undefined)).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// objectiveKeyToOptionValue — MCQ with shuffled displayOrder [2,0,3,1]
// ---------------------------------------------------------------------------

describe("objectiveKeyToOptionValue — MCQ shuffled [2,0,3,1]", () => {
  const params = {
    type: "multiple-choice",
    optionCount: 4,
    displayOrder: [2, 0, 3, 1],
  };

  it('key "1" → "2" (1st displayed is original index 2)', () => {
    expect(objectiveKeyToOptionValue("1", params)).toBe("2");
  });

  it('key "2" → "0"', () => {
    expect(objectiveKeyToOptionValue("2", params)).toBe("0");
  });

  it('key "3" → "3"', () => {
    expect(objectiveKeyToOptionValue("3", params)).toBe("3");
  });

  it('key "4" → "1"', () => {
    expect(objectiveKeyToOptionValue("4", params)).toBe("1");
  });

  it('key "5" → null (out of range)', () => {
    expect(objectiveKeyToOptionValue("5", params)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// objectiveKeyToOptionValue — MCQ with NO displayOrder (identity)
// ---------------------------------------------------------------------------

describe("objectiveKeyToOptionValue — MCQ no displayOrder (identity)", () => {
  const params = { type: "multiple-choice", optionCount: 4 };

  it('key "1" → "0"', () => {
    expect(objectiveKeyToOptionValue("1", params)).toBe("0");
  });

  it('key "2" → "1"', () => {
    expect(objectiveKeyToOptionValue("2", params)).toBe("1");
  });

  it('key "3" → "2"', () => {
    expect(objectiveKeyToOptionValue("3", params)).toBe("2");
  });

  it('key "4" → "3"', () => {
    expect(objectiveKeyToOptionValue("4", params)).toBe("3");
  });

  it('key "5" → null (out of range)', () => {
    expect(objectiveKeyToOptionValue("5", params)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// objectiveKeyToOptionValue — MCQ with mismatched displayOrder → identity
// ---------------------------------------------------------------------------

describe("objectiveKeyToOptionValue — MCQ displayOrder length mismatch", () => {
  const params = {
    type: "multiple-choice",
    optionCount: 4,
    displayOrder: [1, 0, 2], // only 3 elements for 4 options
  };

  it("falls back to identity: key 1 → 0", () => {
    expect(objectiveKeyToOptionValue("1", params)).toBe("0");
  });

  it("falls back to identity: key 4 → 3", () => {
    expect(objectiveKeyToOptionValue("4", params)).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// objectiveKeyToOptionValue — true-false (displayOrder ignored)
// ---------------------------------------------------------------------------

describe("objectiveKeyToOptionValue — true-false", () => {
  const base = { type: "true-false", optionCount: 2 };

  it('key "1" → "0" (O)', () => {
    expect(objectiveKeyToOptionValue("1", base)).toBe("0");
  });

  it('key "2" → "1" (X)', () => {
    expect(objectiveKeyToOptionValue("2", base)).toBe("1");
  });

  it('key "3" → null (out of range)', () => {
    expect(objectiveKeyToOptionValue("3", base)).toBeNull();
  });

  it("ignores displayOrder even when passed", () => {
    // [1, 0] would swap O and X if respected — but true-false always uses identity
    expect(objectiveKeyToOptionValue("1", { ...base, displayOrder: [1, 0] })).toBe(
      "0",
    );
    expect(objectiveKeyToOptionValue("2", { ...base, displayOrder: [1, 0] })).toBe(
      "1",
    );
  });
});

// ---------------------------------------------------------------------------
// objectiveKeyToOptionValue — edge cases: non-digit / "0" / multi-char keys
// ---------------------------------------------------------------------------

describe("objectiveKeyToOptionValue — invalid / non-digit keys", () => {
  const params = { type: "multiple-choice", optionCount: 4 };

  it('returns null for "0"', () => {
    expect(objectiveKeyToOptionValue("0", params)).toBeNull();
  });

  it("returns null for letter key", () => {
    expect(objectiveKeyToOptionValue("a", params)).toBeNull();
  });

  it("returns null for Enter", () => {
    expect(objectiveKeyToOptionValue("Enter", params)).toBeNull();
  });

  it("returns null for ArrowUp", () => {
    expect(objectiveKeyToOptionValue("ArrowUp", params)).toBeNull();
  });

  it("returns null for multi-char string like '10'", () => {
    expect(objectiveKeyToOptionValue("10", params)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(objectiveKeyToOptionValue("", params)).toBeNull();
  });

  it("returns null for space", () => {
    expect(objectiveKeyToOptionValue(" ", params)).toBeNull();
  });
});
