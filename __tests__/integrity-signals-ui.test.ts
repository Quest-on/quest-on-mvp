/**
 * 채점 화면 '의심 표시' 토글의 렌더 결과 (이슈 #514).
 *
 * 이 저장소에는 `@testing-library/*`·`jsdom` 이 없다. 그래서 `react-dom/server` 로
 * 컴포넌트를 실제 렌더하고, next-intl 만 키를 그대로 돌려주는 가짜로 바꾼다
 * (`password-reset-recovery-page.test.ts` 와 같은 방식). 렌더 결과의 한계: 클릭으로
 * 토글이 바뀌는 상호작용은 증명하지 못한다. 그건 스테이징 QA 의 몫이다.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PasteLog } from "@/lib/highlight-paste";

vi.mock("next-intl", () => ({
  // 번역 대신 `키(값=…)` 를 돌려줘서 어떤 문구가 몇 건으로 그려지는지 본다.
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([k, v]) => `${k}=${v}`)
          .join(",")})`
      : key,
  useLocale: () => "ko",
}));

const ANSWER = "외부에서 가져온 문장입니다. AI 답변에서 복사한 문장입니다. 직접 쓴 문장입니다.";

function log(overrides: Partial<PasteLog> & { id: string }): PasteLog {
  return {
    question_id: "q1",
    length: 10,
    pasted_text: "",
    is_internal: false,
    suspicious: true,
    timestamp: "2026-10-06T01:00:00Z",
    created_at: "2026-10-06T01:00:00Z",
    ...overrides,
  };
}

const EXTERNAL = log({
  id: "e1",
  length: 14,
  pasted_text: "외부에서 가져온 문장입니다.",
});
const INTERNAL = log({
  id: "i1",
  length: 18,
  pasted_text: "AI 답변에서 복사한 문장입니다.",
  is_internal: true,
  suspicious: false,
});
// 서버는 탭 전환도 suspicious=true, 길이 0 으로 저장한다.
const TABS = ["t1", "t2", "t3"].map((id) =>
  log({ id, length: 0, pasted_text: "[TAB_SWITCH]", paste_start: 0, paste_end: 0 }),
);

async function renderCard(props: {
  pasteLogs: PasteLog[];
  showIntegritySignals?: boolean;
  answer?: string;
}): Promise<string> {
  const { FinalAnswerCard } = await import("@/components/instructor/FinalAnswerCard");
  return renderToStaticMarkup(
    createElement(FinalAnswerCard, {
      submission: { id: "s1", q_idx: 0, answer: props.answer ?? ANSWER },
      pasteLogs: props.pasteLogs,
      questionId: "q1",
      ...(props.showIntegritySignals === undefined
        ? {}
        : { showIntegritySignals: props.showIntegritySignals }),
    }),
  );
}

describe("FinalAnswerCard — 의심 표시 켜짐 (기본값, 현행 동작)", () => {
  const all = [EXTERNAL, ...TABS, INTERNAL];

  it("prop 을 안 넘기면 켜짐이다 (과제 채점 화면 등 기존 호출부가 그대로다)", async () => {
    const omitted = await renderCard({ pasteLogs: all });
    const explicit = await renderCard({ pasteLogs: all, showIntegritySignals: true });
    expect(omitted).toBe(explicit);
  });

  it("외부 붙여넣기 뱃지는 탭 전환을 합산하지 않는다", async () => {
    const html = await renderCard({ pasteLogs: all });
    expect(html).toContain("finalAnswerCard.badgeSuspicious(count=1)");
    expect(html).not.toContain("finalAnswerCard.badgeSuspicious(count=4)");
  });

  it("탭 전환은 '탭 전환 N회' 로 따로 표시한다", async () => {
    const html = await renderCard({ pasteLogs: all });
    expect(html).toContain("finalAnswerCard.badgeTabSwitch(count=3)");
    expect(html).toContain("finalAnswerCard.tabSwitchTitle");
    expect(html.match(/finalAnswerCard\.tabSwitchLog\(/g)).toHaveLength(3);
  });

  it("탭 전환 행을 '0자 외부 붙여넣기' 로 그리지 않는다", async () => {
    const html = await renderCard({ pasteLogs: all });
    expect(html).not.toContain("finalAnswerCard.suspiciousLog(chars=0,");
    // 진짜 외부 붙여넣기 한 건만 목록에 있다.
    expect(html.match(/finalAnswerCard\.suspiciousLog\(/g)).toHaveLength(1);
  });

  it("외부는 빨강, 내부는 파랑으로 본문을 칠하고 범례가 둘 다 있다", async () => {
    const html = await renderCard({ pasteLogs: all });
    expect(html).toContain("bg-red-200");
    expect(html).toContain("bg-blue-200");
    expect(html).toContain("finalAnswerCard.legendExternal");
    expect(html).toContain("finalAnswerCard.legendInternal");
  });

  it("탭 전환만 있으면 범례를 그리지 않는다 (칠해지는 본문이 없다)", async () => {
    const html = await renderCard({ pasteLogs: TABS });
    expect(html).toContain("finalAnswerCard.badgeTabSwitch(count=3)");
    expect(html).not.toContain("finalAnswerCard.badgeSuspicious");
    expect(html).not.toContain("finalAnswerCard.legendModified");
    expect(html).not.toContain("<mark");
  });
});

describe("FinalAnswerCard — 의심 표시 꺼짐", () => {
  const all = [EXTERNAL, ...TABS, INTERNAL];

  it("빨간 뱃지, 경고 박스, 탭 전환 표시가 모두 숨겨진다", async () => {
    const html = await renderCard({ pasteLogs: all, showIntegritySignals: false });
    for (const hidden of [
      "finalAnswerCard.badgeSuspicious",
      "finalAnswerCard.suspiciousTitle",
      "finalAnswerCard.suspiciousLog",
      "finalAnswerCard.badgeTabSwitch",
      "finalAnswerCard.tabSwitchTitle",
      "finalAnswerCard.tabSwitchLog",
    ]) {
      expect(html, hidden).not.toContain(hidden);
    }
    // Badge 기본 클래스에 aria-invalid:*-destructive 가 있어서 "destructive" 통째로는 못 본다.
    expect(html).not.toContain("bg-destructive");
    expect(html).not.toContain("text-destructive");
  });

  it("범례에서 의심 항목(외부 복사, 붙여넣기 후 수정됨)이 빠진다", async () => {
    const html = await renderCard({ pasteLogs: all, showIntegritySignals: false });
    expect(html).not.toContain("finalAnswerCard.legendExternal");
    expect(html).not.toContain("finalAnswerCard.legendModified");
  });

  it("본문의 외부 붙여넣기 빨간 하이라이트가 사라진다", async () => {
    const html = await renderCard({ pasteLogs: all, showIntegritySignals: false });
    expect(html).not.toContain("bg-red-200");
    expect(html).not.toContain("bg-red-100");
    // 답안 텍스트 자체는 그대로 보인다.
    expect(html).toContain("외부에서 가져온 문장입니다.");
  });

  it("내부 복사(파란색)는 뱃지, 안내 박스, 범례, 하이라이트 모두 계속 보인다", async () => {
    const html = await renderCard({ pasteLogs: all, showIntegritySignals: false });
    expect(html).toContain("finalAnswerCard.badgeInternal(count=1)");
    expect(html).toContain("finalAnswerCard.internalTitle");
    expect(html).toContain("finalAnswerCard.internalLog(");
    expect(html).toContain("finalAnswerCard.legendInternal");
    expect(html).toContain("bg-blue-200");
  });

  it("내부 복사가 없으면 범례 줄 자체가 없다", async () => {
    const html = await renderCard({
      pasteLogs: [EXTERNAL, ...TABS],
      showIntegritySignals: false,
    });
    expect(html).not.toContain("finalAnswerCard.legendInternal");
    expect(html).not.toContain("finalAnswerCard.legendModified");
    expect(html).not.toContain("<mark");
  });

  it("꺼져 있어도 답안의 태그는 이스케이프된다 (XSS 가드)", async () => {
    const html = await renderCard({
      pasteLogs: [INTERNAL],
      showIntegritySignals: false,
      answer: "<img src=x onerror=alert(1)> AI 답변에서 복사한 문장입니다.",
    });
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;img");
  });
});

describe("IntegritySignalsToggle", () => {
  async function renderToggle(checked: boolean): Promise<string> {
    const { IntegritySignalsToggle } = await import(
      "@/components/instructor/IntegritySignalsToggle"
    );
    return renderToStaticMarkup(
      createElement(IntegritySignalsToggle, { checked, onCheckedChange: () => {} }),
    );
  }

  it("라벨과 보조 설명을 그린다", async () => {
    const html = await renderToggle(true);
    expect(html).toContain("finalAnswerCard.integrityToggleLabel");
    expect(html).toContain("finalAnswerCard.integrityToggleHint");
  });

  it("스위치 상태가 checked 를 따른다", async () => {
    expect(await renderToggle(true)).toContain('aria-checked="true"');
    expect(await renderToggle(false)).toContain('aria-checked="false"');
  });

  it("라벨이 스위치에 연결되고 보조 설명이 스위치의 설명으로 묶인다", async () => {
    const html = await renderToggle(true);
    const switchTag = html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    const switchId = switchTag.match(/\sid="([^"]+)"/)?.[1];
    expect(switchId).toBeTruthy();
    expect(html).toContain(`for="${switchId}"`);
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });
});

describe("메시지 키", () => {
  const read = (locale: "ko" | "en") =>
    JSON.parse(readFileSync(resolve(__dirname, "..", "messages", locale, "authoring.json"), "utf8"))
      .finalAnswerCard as Record<string, string>;

  const NEW_KEYS = [
    "badgeTabSwitch",
    "tabSwitchTitle",
    "tabSwitchLog",
    "integrityToggleLabel",
    "integrityToggleHint",
  ];

  it("새 키가 ko, en 양쪽에 있다", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const key of NEW_KEYS) {
        expect(read(locale)[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("한국어 라벨은 '의심 표시' 이고 설명은 기록이 보관된다고 알린다", () => {
    const ko = read("ko");
    expect(ko.integrityToggleLabel).toBe("의심 표시");
    expect(ko.integrityToggleHint).toContain("탭 전환");
    expect(ko.integrityToggleHint).toContain("외부 붙여넣기");
    expect(ko.integrityToggleHint).toContain("기록은 그대로 보관");
  });

  it("컴포넌트가 쓰는 finalAnswerCard 키가 전부 ko 메시지에 있다", () => {
    const ko = read("ko");
    const sources = [
      "components/instructor/FinalAnswerCard.tsx",
      "components/instructor/IntegritySignalsToggle.tsx",
    ].map((p) => readFileSync(resolve(__dirname, "..", p), "utf8"));
    const used = new Set<string>();
    for (const source of sources) {
      for (const m of source.matchAll(/t\(\s*"finalAnswerCard\.([A-Za-z]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) expect(ko[key], key).toBeTruthy();
  });
});
