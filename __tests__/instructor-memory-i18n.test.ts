import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ko/en `memory.*` 카탈로그 대칭성.
 *
 * 한쪽에만 키를 추가하면 반드시 깨져야 한다. 화면은 두 로케일 모두에서 렌더되고,
 * 빠진 키는 배포 후 사용자 화면에서 raw key 로 튀어나온다.
 */
function memoryCatalogue(locale: "ko" | "en"): Record<string, unknown> {
  const parsed = JSON.parse(
    readFileSync(`messages/${locale}/instructor.json`, "utf8"),
  ) as Record<string, unknown>;
  const memory = parsed.memory;
  if (typeof memory !== "object" || memory === null) {
    throw new Error(`messages/${locale}/instructor.json is missing the memory namespace`);
  }
  return memory as Record<string, unknown>;
}

function leafEntries(value: unknown, path = ""): Array<[string, unknown]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [[path, value]];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, path ? `${path}.${key}` : key),
  );
}

function leafKeys(locale: "ko" | "en"): string[] {
  return leafEntries(memoryCatalogue(locale))
    .map(([path]) => path)
    .sort();
}

describe("instructor memory messages — ko/en symmetry", () => {
  const ko = leafKeys("ko");
  const en = leafKeys("en");

  it("has a non-trivial key set in both catalogues", () => {
    expect(ko.length).toBeGreaterThan(50);
    expect(en.length).toBe(ko.length);
  });

  it("keeps the Korean and English key sets identical", () => {
    expect(ko).toEqual(en);
  });

  it("fails when a key exists in only one catalogue", () => {
    // 대칭성 검사가 실제로 한쪽만의 추가를 잡는지 확인한다.
    // 이 가드가 없으면 위 assertion 이 우연히 통과하는 형태로 썩을 수 있다.
    const koPlusOne = [...ko, "memory.onlyInKorean"].sort();
    expect(koPlusOne).not.toEqual(en);

    const enPlusOne = [...en, "memory.onlyInEnglish"].sort();
    expect(ko).not.toEqual(enPlusOne);
  });

  it("uses non-empty strings for every leaf in both catalogues", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const [path, value] of leafEntries(memoryCatalogue(locale))) {
        expect(typeof value, `${locale}:${path}`).toBe("string");
        expect((value as string).trim(), `${locale}:${path}`).not.toBe("");
      }
    }
  });

  it("covers every input_origin in the migration vocabulary plus an unknown label", () => {
    // database/030_instructor_memory.sql 의 CHECK 어휘. 하나라도 빠지면 화면이 raw key 를 낸다.
    const origins = ["typed", "quick_reply", "pasted", "imported", "derived", "unknown"];
    for (const locale of ["ko", "en"] as const) {
      const catalogue = memoryCatalogue(locale) as { origin: Record<string, string> };
      expect(Object.keys(catalogue.origin).sort()).toEqual([...origins].sort());
    }
  });

  it("states the three honest-deletion facts in both the delete and reset copy", () => {
    for (const locale of ["ko", "en"] as const) {
      const catalogue = memoryCatalogue(locale) as {
        delete: Record<string, string>;
        controls: { reset: Record<string, string> };
      };
      for (const key of ["stopsUse", "logsRemain", "evidenceKept", "notErasure"]) {
        expect(catalogue.delete[key], `${locale}:delete.${key}`).toBeTruthy();
      }
      for (const key of [
        "confirmStopsUse",
        "confirmLogsRemain",
        "confirmEvidenceKept",
        "confirmNotErasure",
      ]) {
        expect(
          catalogue.controls.reset[key],
          `${locale}:controls.reset.${key}`,
        ).toBeTruthy();
      }
    }
  });

  it("states the five consent clauses required for a separate opt-in notice", () => {
    for (const locale of ["ko", "en"] as const) {
      const consent = (memoryCatalogue(locale) as { consent: Record<string, string> }).consent;
      for (const key of [
        "separateFromTerms",
        "items",
        "purpose",
        "retention",
        "refusal",
        "refusalCost",
      ]) {
        expect(consent[key], `${locale}:consent.${key}`).toBeTruthy();
      }
    }
  });
});
