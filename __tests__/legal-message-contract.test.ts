import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * AC-D1 / AC-D2 / AC-D3 — 개인정보처리방침 메시지 계약.
 *
 * 처리방침은 법적 문서다. 여기 적힌 내용과 실제 처리가 다르면 그 자체가 위반이다.
 * 그래서 "빠지면 안 되는 것"과 "있으면 안 되는 것"을 둘 다 고정한다.
 */

const ROOT = path.resolve(__dirname, "..");

const ko = JSON.parse(
  fs.readFileSync(path.join(ROOT, "messages", "ko", "legal.json"), "utf8"),
);
const en = JSON.parse(
  fs.readFileSync(path.join(ROOT, "messages", "en", "legal.json"), "utf8"),
);
const privacyPage = fs.readFileSync(
  path.join(ROOT, "app", "legal", "privacy", "page.tsx"),
  "utf8",
);

/** 중첩 객체를 `a.b.c` 형태의 leaf 경로 집합으로 편다. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value as Record<string, unknown>).flatMap(leafValues);
}

function get(root: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], root);
}

describe("legal messages — ko/en 대칭", () => {
  it("privacy 하위 leaf 경로 집합이 정확히 같다", () => {
    const koPaths = leafPaths(ko.privacy).sort();
    const enPaths = leafPaths(en.privacy).sort();
    expect(koPaths).toEqual(enPaths);
  });

  it("모든 privacy leaf 가 non-empty 문자열이다", () => {
    for (const [locale, doc] of [
      ["ko", ko],
      ["en", en],
    ] as const) {
      for (const value of leafValues(doc.privacy)) {
        expect(value.trim(), `${locale} 에 빈 문구가 있다`).not.toBe("");
      }
    }
  });
});

describe("legal messages — 금지 문구", () => {
  // 이 문자열들은 전부 실제 처리와 어긋나거나 법 적용을 왜곡한다.
  const FORBIDDEN_KO = [
    "제3자에게 제공하지 않습니다", // 교수자에게 성적과 대화 전문을 제공한다. 거짓이다.
    "기관 계약 종료", // 기관 계약 개념이 코드에 없다. 보존 기준으로 쓸 수 없다.
    "TBD",
    "준비 중",
  ];

  it("ko privacy 에 금지 문구가 없다", () => {
    const joined = leafValues(ko.privacy).join("\n");
    for (const forbidden of FORBIDDEN_KO) {
      expect(joined, `금지 문구가 남아 있다: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("보존 데이터를 익명이라고 주장하지 않는다", () => {
    // 해시는 익명이 아니라 가명이다. 익명이라 쓰면 법 적용 자체가 달라진다.
    // 다만 "익명정보가 아니라 가명정보" 처럼 명시적으로 부정하는 문장은
    // 오히려 정확한 고지이므로 통과시켜야 한다. 단정 표현만 잡는다.
    for (const value of leafValues(ko.privacy)) {
      if (!value.includes("익명")) continue;
      expect(value, `익명이라고 주장하는 문구가 있다: ${value}`).toMatch(
        /익명[^.]*아니/,
      );
    }
    expect(leafValues(ko.privacy).join("\n")).not.toMatch(/익명(화|처리)/);
  });

  it("수탁자 표기에 플레이스홀더가 없다", () => {
    for (const doc of [ko, en]) {
      const rows = doc.privacy.section4.processing.rows as Record<
        string,
        { name: string }
      >;
      for (const row of Object.values(rows)) {
        expect(row.name).not.toMatch(/provider|vendor|TBD/i);
        // 범주명(예: "클라우드 호스팅 업체")은 수탁자 공개 의무를 충족하지 못한다.
        expect(row.name).not.toMatch(/업체|제공사/);
      }
    }
  });
});

describe("legal messages — 수탁자 법인명 (AC-D2)", () => {
  const EXPECTED = [
    "OpenAI, L.L.C.",
    "Supabase, Inc.",
    "Vercel Inc.",
    "Upstash, Inc.",
  ] as const;

  it("ko/en 모두 정확히 네 법인명을 쓴다", () => {
    for (const doc of [ko, en]) {
      const names = Object.values(
        doc.privacy.section4.processing.rows as Record<string, { name: string }>,
      ).map((row) => row.name);
      expect(names.sort()).toEqual([...EXPECTED].sort());
    }
  });

  it("국외이전 블록도 같은 법인명을 쓴다", () => {
    for (const doc of [ko, en]) {
      const recipients = doc.privacy.section5.recipientValue as string;
      for (const name of EXPECTED) {
        expect(recipients).toContain(name);
      }
    }
  });
});

describe("legal messages — 국외이전 공개항목 (제28조의8②)", () => {
  const REQUIRED_KEYS = [
    "recipientValue",
    "contactValue",
    "countryValue",
    "timingValue",
    "methodValue",
    "itemsValue",
    "purposeValue",
    "retentionValue",
    "basisValue",
    "optOutValue",
    "optOutEffectValue",
  ] as const;

  it("공개항목이 전부 있고 거부 방법과 거부 효과가 분리돼 있다", () => {
    for (const [locale, doc] of [
      ["ko", ko],
      ["en", en],
    ] as const) {
      for (const key of REQUIRED_KEYS) {
        const value = doc.privacy.section5[key];
        expect(typeof value, `${locale}.section5.${key} 가 없다`).toBe("string");
        expect((value as string).trim()).not.toBe("");
      }
      // 거부해도 아무 일 없다는 식이면 고지가 아니다.
      expect(doc.privacy.section5.optOutValue).not.toBe(
        doc.privacy.section5.optOutEffectValue,
      );
    }
  });

  it("법적 근거로 제28조의8①3호를 명시한다", () => {
    expect(ko.privacy.section5.basisValue).toContain("제28조의8");
    expect(en.privacy.section5.basisValue).toContain("28-8");
  });
});

describe("legal messages — 제3자 제공 (제17조④)", () => {
  it("시행령 제14조의2 네 판단기준이 별개 값으로 존재한다", () => {
    for (const [locale, doc] of [
      ["ko", ko],
      ["en", en],
    ] as const) {
      const tp = doc.privacy.section4.thirdParty;
      const criteria = [tp.criteria1, tp.criteria2, tp.criteria3, tp.criteria4];
      for (const [index, value] of criteria.entries()) {
        expect(typeof value, `${locale} criteria${index + 1} 가 없다`).toBe("string");
        expect((value as string).trim()).not.toBe("");
      }
      // 하나로 뭉뚱그리면 판단기준을 각각 공개한 게 아니다.
      expect(new Set(criteria).size).toBe(4);
    }
  });

  it("법적 근거로 제17조④를 명시한다", () => {
    expect(ko.privacy.section4.thirdParty.basis).toContain("제17조제4항");
    expect(en.privacy.section4.thirdParty.basis).toContain("17(4)");
  });
});

describe("legal messages — 파기 절차", () => {
  it("탈퇴 후 보존을 가명정보로 명시한다", () => {
    expect(ko.privacy.section3.pseudonymized.nature).toContain("가명정보");
    expect(en.privacy.section3.pseudonymized.nature).toContain("pseudonymized");
  });

  it("미완료 계정 파기 leaf 3개가 ko/en 모두 있다", () => {
    for (const [locale, doc] of [
      ["ko", ko],
      ["en", en],
    ] as const) {
      for (const key of ["scope", "retention", "destruction"] as const) {
        const value = doc.privacy.section3.incompleteAccounts[key];
        expect(
          typeof value,
          `${locale}.section3.incompleteAccounts.${key} 가 없다`,
        ).toBe("string");
        expect((value as string).trim()).not.toBe("");
      }
    }
  });
});

describe("legal messages — 보호책임자와 개정일", () => {
  it("담당 부서를 표기한다", () => {
    expect(ko.privacy.section8.department.trim()).not.toBe("");
    expect(en.privacy.section8.department.trim()).not.toBe("");
  });

  it("lastModified 가 개정일로 갱신됐다", () => {
    expect(ko.lastModified).toBe("2026-08-10");
    expect(en.lastModified).toBe("2026-08-10");
  });
});

describe("legal messages — terms subtree 불변 (canonical hash 입력)", () => {
  it("ko/en terms 가 완전히 동일한 구조를 유지한다", () => {
    // terms 는 정책 릴리스 content_hash 의 입력이다. 한 글자만 바뀌어도
    // database/020 의 해시와 불일치해 CI 와 배포가 실패한다.
    expect(leafPaths(ko.terms).sort()).toEqual(leafPaths(en.terms).sort());
    expect(leafValues(ko.terms).every((v) => v.trim() !== "")).toBe(true);
  });
});

describe("privacy page — 추가 leaf 가 실제로 렌더된다 (AC-D3)", () => {
  const MUST_RENDER = [
    "privacy.section3.pseudonymized.nature",
    "privacy.section3.pseudonymized.separation",
    "privacy.section3.incompleteAccounts.scope",
    "privacy.section3.incompleteAccounts.retention",
    "privacy.section3.incompleteAccounts.destruction",
    "privacy.section4.thirdParty.recipient",
    "privacy.section4.thirdParty.basis",
    "privacy.section4.thirdParty.criteria1",
    "privacy.section4.thirdParty.criteria4",
    "privacy.section4.processing.rows.hosting.name",
    "privacy.section4.processing.rows.cache.name",
    "privacy.section5.recipientValue",
    "privacy.section5.contactValue",
    "privacy.section5.timingValue",
    "privacy.section5.methodValue",
    "privacy.section5.basisValue",
    "privacy.section5.optOutEffectValue",
    "privacy.section8.department",
  ] as const;

  it("JSON 에만 넣고 페이지가 안 읽는 leaf 가 없다", () => {
    for (const key of MUST_RENDER) {
      expect(privacyPage, `${key} 가 페이지에서 렌더되지 않는다`).toContain(key);
      // 메시지 자체도 존재해야 한다.
      expect(get(ko, key), `ko 에 ${key} 가 없다`).toBeTypeOf("string");
      expect(get(en, key), `en 에 ${key} 가 없다`).toBeTypeOf("string");
    }
  });

  it("삭제된 옛 키를 페이지가 더 이상 참조하지 않는다", () => {
    for (const stale of [
      "privacy.section4.processing.rows.email",
      "privacy.section5.countryValue\")}</li>\n            <li><strong>{t(\"privacy.section5.items",
    ]) {
      expect(privacyPage).not.toContain(stale);
    }
  });
});
