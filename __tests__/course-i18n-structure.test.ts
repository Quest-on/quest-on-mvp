import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

/**
 * 과목 선택기(components/instructor/CourseSelectField.tsx)가 쓰는 메시지 계약.
 *
 * 문구 자체는 검증하지 않는다 — 카피는 바뀌라고 있는 것이다.
 * 검증하는 건 "ko/en 이 같은 키를 갖는가"뿐이다. 한쪽에만 키를 넣으면
 * 다른 로케일에서 next-intl 이 키 문자열을 그대로 화면에 뱉기 때문이다.
 */
function courseMessages(locale: "ko" | "en"): unknown {
  return JSON.parse(
    readFileSync(`messages/${locale}/instructor.json`, "utf8"),
  ).course;
}

function leafEntries(value: unknown, path = ""): Array<[string, unknown]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [[path, value]];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, path ? `${path}.${key}` : key),
  );
}

describe("instructor course picker messages", () => {
  it("keeps Korean and English course key sets identical", () => {
    const koKeys = leafEntries(courseMessages("ko")).map(([path]) => path).sort();
    const enKeys = leafEntries(courseMessages("en")).map(([path]) => path).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it("uses non-empty strings for every course message", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const [path, value] of leafEntries(courseMessages(locale))) {
        expect(typeof value, `${locale}.course.${path}`).toBe("string");
        expect((value as string).trim(), `${locale}.course.${path}`).not.toBe("");
      }
    }
  });

  it("ships every key the component reads", () => {
    // 컴포넌트가 t("course.X") 로 실제 읽는 키. 지우면 런타임에 키가 그대로 노출된다.
    const required = [
      "label",
      "optional",
      "helper",
      "placeholder",
      "none",
      "itemWithTerm",
      "loading",
      "loadError",
      "emptyTitle",
      "emptyDescription",
      "addButton",
      "nameLabel",
      "namePlaceholder",
      "termLabel",
      "termPlaceholder",
      "createSubmit",
      "creating",
      "cancel",
      "createError",
    ];
    for (const locale of ["ko", "en"] as const) {
      const keys = leafEntries(courseMessages(locale)).map(([path]) => path);
      for (const key of required) {
        expect(keys, `${locale}.course.${key}`).toContain(key);
      }
    }
  });

  it("keeps the term placeholder interpolation in both locales", () => {
    // term 이 있는 과목은 "{name} · {term}" 으로 합쳐 보여준다. 한쪽에서
    // 자리표시자가 빠지면 학기가 조용히 사라진다.
    for (const locale of ["ko", "en"] as const) {
      const item = (courseMessages(locale) as Record<string, string>).itemWithTerm;
      expect(item, locale).toContain("{name}");
      expect(item, locale).toContain("{term}");
    }
  });
});
