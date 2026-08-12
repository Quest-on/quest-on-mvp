import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { MemoryRecordList } from "@/components/instructor/memory/MemoryRecordList";
import { MemoryDeletionDisclosure } from "@/components/instructor/memory/MemoryDeletionDisclosure";
import { MemoryConsentNotice } from "@/components/instructor/memory/MemoryConsentNotice";
import { MemoryObservationControls } from "@/components/instructor/memory/MemoryObservationControls";
import { normalizeMemoryRecord, type InstructorMemoryRecord } from "@/lib/instructor-memory";

/**
 * 화면 렌더 계약.
 *
 * 초록색 tsc 는 렌더에 대해 아무것도 증명하지 않는다. 여기서는 실제 마크업을 만들어
 * 세 가지 상태(빈 목록 · 에러 · 레코드)와 null 출처 표기를 문자열로 확인한다.
 */
interface MemoryCatalogue {
  empty: Record<string, string>;
  error: Record<string, string>;
  list: Record<string, string>;
  scope: Record<string, string>;
  status: Record<string, string>;
  source: Record<string, string>;
  origin: Record<string, string>;
  record: Record<string, string>;
  delete: Record<string, string>;
  consent: Record<string, string>;
  shadow: Record<string, string>;
  controls: {
    title: string;
    distinctionNote: string;
    pause: Record<string, string>;
    reset: Record<string, string>;
  };
}

const instructorMessages = JSON.parse(
  readFileSync("messages/ko/instructor.json", "utf8"),
) as Record<string, unknown>;
const messages = { instructor: instructorMessages };
const memory = instructorMessages.memory as MemoryCatalogue;

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: "ko",
      messages,
      timeZone: "Asia/Seoul",
      children: node,
    }),
  );
}

const noop = () => {};

function apiRecord(overrides: Record<string, unknown> = {}): InstructorMemoryRecord {
  const record = normalizeMemoryRecord({
    id: "11111111-2222-4333-8444-555555555555",
    value: "표기 오류는 감점하지 않고 개념 오류만 감점한다",
    predicate: "grading.edge_case_rule",
    scope: "exam",
    scopeId: "99999999-8888-4777-8666-555555555555",
    status: "active",
    source: {
      table: "bulk_grading_messages",
      messageId: "abcdabcd-1111-4222-8333-444444444444",
      occurredAt: "2026-08-03T04:05:06.000Z",
      inputOrigin: "pasted",
    },
    extractorVersion: "v1",
    createdAt: "2026-08-03T04:05:07.000Z",
    updatedAt: "2026-08-03T04:05:07.000Z",
    ...overrides,
  });
  if (!record) throw new Error("fixture failed to normalize");
  return record;
}

describe("MemoryRecordList — empty record list", () => {
  const html = render(
    React.createElement(MemoryRecordList, { status: "success", records: [], onDelete: noop }),
  );

  it("renders an explanation, not a blank list", () => {
    expect(html).toContain('data-testid="memory-empty-state"');
    expect(html).toContain(memory.empty.title);
    expect(html).toContain(memory.empty.body);
    expect(html).toContain(memory.empty.how);
  });

  it("says an empty list is not an error", () => {
    expect(html).toContain(memory.empty.note);
  });

  it("carries real prose rather than an empty container", () => {
    // 설명문이 실제로 문장 길이를 갖는지 확인한다. 빈 목록에 라벨 한 줄만 두면 통과하지 못한다.
    expect(memory.empty.body.length).toBeGreaterThan(30);
    const textOnly = html.replace(/<[^>]*>/g, "").trim();
    expect(textOnly.length).toBeGreaterThan(80);
  });

  it("renders no record cards and no error alert", () => {
    expect(html).not.toContain('data-testid="memory-record"');
    expect(html).not.toContain('data-testid="memory-error-state"');
  });
});

describe("MemoryRecordList — error", () => {
  const html = render(
    React.createElement(MemoryRecordList, {
      status: "error",
      records: [],
      onDelete: noop,
      onRetry: noop,
    }),
  );

  it("renders an error alert with a retry affordance", () => {
    expect(html).toContain('data-testid="memory-error-state"');
    expect(html).toContain(memory.error.title);
    expect(html).toContain(memory.error.body);
    expect(html).toContain(memory.error.retry);
  });

  it("does not fall back to the empty state, which would hide the failure", () => {
    expect(html).not.toContain('data-testid="memory-empty-state"');
    expect(html).not.toContain(memory.empty.title);
  });
});

describe("MemoryRecordList — with records", () => {
  const html = render(
    React.createElement(MemoryRecordList, {
      status: "success",
      records: [apiRecord()],
      onDelete: noop,
    }),
  );

  it("shows the value, its predicate, its scope and the scope target", () => {
    expect(html).toContain("표기 오류는 감점하지 않고 개념 오류만 감점한다");
    expect(html).toContain("grading.edge_case_rule");
    expect(html).toContain(memory.scope.exam);
    expect(html).toContain("99999999-8888-4777-8666-555555555555");
  });

  it("shows provenance: which source, which message, and when", () => {
    expect(html).toContain(memory.source.bulk_grading_messages);
    expect(html).toContain("abcdabcd-1111-4222-8333-444444444444");
    // UTC 로 고정 표기한다 — 서버/클라이언트 타임존이 달라도 증거 값이 흔들리지 않아야 한다.
    expect(html).toContain("2026-08-03 04:05Z");
  });

  it("shows the input origin and a per-record delete control", () => {
    expect(html).toContain(memory.origin.pasted);
    expect(html).toContain(memory.record.deleteAction);
  });

  it("shows the record count", () => {
    expect(html).toContain('data-testid="memory-record-count"');
  });
});

describe("MemoryRecordList — malformed rows from the API", () => {
  it("renders a null input_origin as ORIGIN UNKNOWN and never as typed", () => {
    const record = apiRecord({
      source: {
        table: "bulk_grading_messages",
        messageId: null,
        occurredAt: "2026-08-03T04:05:06.000Z",
        inputOrigin: null,
      },
    });
    expect(record.source.inputOrigin).toBeNull();

    const html = render(
      React.createElement(MemoryRecordList, {
        status: "success",
        records: [record],
        onDelete: noop,
      }),
    );

    expect(html).toContain('data-testid="memory-origin-unknown"');
    expect(html).toContain(memory.origin.unknown);
    expect(html).not.toContain(memory.origin.typed);
    expect(html).toContain(memory.record.messageUnknown);
  });

  it("renders a null scope_id as an explicit 'no target' label", () => {
    const record = apiRecord({ scope: "global", scopeId: null });
    const html = render(
      React.createElement(MemoryRecordList, {
        status: "success",
        records: [record],
        onDelete: noop,
      }),
    );
    expect(html).toContain(memory.scope.global);
    expect(html).toContain(memory.record.scopeIdUnknown);
  });

  it("drops rows with no id rather than rendering a card that cannot be deleted", () => {
    expect(normalizeMemoryRecord({ predicate: "grading.edge_case_rule" })).toBeNull();
    expect(normalizeMemoryRecord(null)).toBeNull();
    expect(normalizeMemoryRecord("nonsense")).toBeNull();
  });

  it("does not promote an unknown origin string into a known one", () => {
    const record = apiRecord({
      source: { table: "made_up_table", messageId: null, occurredAt: null, inputOrigin: "keyboard" },
    });
    expect(record.source.inputOrigin).toBeNull();
    expect(record.source.table).toBeNull();
  });
});

describe("MemoryDeletionDisclosure — honest deletion copy", () => {
  for (const variant of ["record", "reset"] as const) {
    const html = render(React.createElement(MemoryDeletionDisclosure, { variant }));
    const copy =
      variant === "record"
        ? {
            stopsUse: memory.delete.stopsUse,
            logsRemain: memory.delete.logsRemain,
            evidenceKept: memory.delete.evidenceKept,
            notErasure: memory.delete.notErasure,
          }
        : {
            stopsUse: memory.controls.reset.confirmStopsUse,
            logsRemain: memory.controls.reset.confirmLogsRemain,
            evidenceKept: memory.controls.reset.confirmEvidenceKept,
            notErasure: memory.controls.reset.confirmNotErasure,
          };

    it(`states all four facts for the ${variant} variant`, () => {
      expect(html).toContain(copy.stopsUse);
      expect(html).toContain(copy.logsRemain);
      expect(html).toContain(copy.evidenceKept);
      expect(html).toContain(copy.notErasure);
    });
  }
});

describe("MemoryConsentNotice — separate opt-in notice", () => {
  const html = render(React.createElement(MemoryConsentNotice));

  it("declares itself separate from the service agreement", () => {
    expect(html).toContain(memory.consent.separateFromTerms);
    expect(html).toContain(memory.consent.sectionLabel);
  });

  it("states the collected items, purpose, retention, right to refuse, and its cost", () => {
    expect(html).toContain(memory.consent.items);
    expect(html).toContain(memory.consent.purpose);
    expect(html).toContain(memory.consent.retention);
    expect(html).toContain(memory.consent.refusal);
    expect(html).toContain(memory.consent.refusalCost);
  });

  it("links out to the terms and privacy policy rather than restating them", () => {
    expect(html).toContain('href="/legal/terms"');
    expect(html).toContain('href="/legal/privacy"');
  });
});

describe("MemoryObservationControls — pause and reset are visibly distinct", () => {
  const html = render(
    React.createElement(MemoryObservationControls, {
      isPaused: false,
      onPause: noop,
      onResume: noop,
      onReset: noop,
    }),
  );

  it("renders two separate controls, not one toggle", () => {
    expect(html).toContain('data-testid="memory-pause-control"');
    expect(html).toContain('data-testid="memory-reset-control"');
    expect(html).toContain('data-testid="memory-pause-button"');
    expect(html).toContain('data-testid="memory-reset-button"');
    // 스위치 하나로 합쳐지면 안 된다.
    expect(html).not.toContain('role="switch"');
  });

  it("gives them different labels and different visual weight", () => {
    expect(html).toContain(memory.controls.pause.action);
    expect(html).toContain(memory.controls.reset.action);
    expect(html).toContain(memory.controls.pause.keepsDataBadge);
    expect(html).toContain(memory.controls.reset.archivesAllBadge);
    // 파괴형 제어만 destructive 토큰을 쓴다.
    expect(html).toContain("bg-destructive");
    expect(html).toContain("border-destructive/40");
  });

  it("explains that pausing keeps data and resetting archives it", () => {
    expect(html).toContain(memory.controls.distinctionNote);
    expect(html).toContain(memory.controls.pause.description);
    expect(html).toContain(memory.controls.reset.description);
  });

  it("swaps the pause control for resume once paused, without touching reset", () => {
    const paused = render(
      React.createElement(MemoryObservationControls, {
        isPaused: true,
        onPause: noop,
        onResume: noop,
        onReset: noop,
      }),
    );
    expect(paused).toContain('data-testid="memory-resume-button"');
    expect(paused).toContain(memory.controls.pause.resumeAction);
    expect(paused).toContain('data-testid="memory-reset-button"');
  });
});
