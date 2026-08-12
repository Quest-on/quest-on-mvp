import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveInstructorMemory,
  fetchInstructorMemories,
  memorySettingsPayload,
  MEMORY_LIST_ENDPOINT,
  MEMORY_SETTINGS_ENDPOINT,
  updateMemorySettings,
} from "@/lib/instructor-memory";
import { qk } from "@/lib/query-keys";

/**
 * 일시중지와 초기화가 같은 호출로 붕괴하지 않는다는 것을 잠근다.
 *
 * 토글 하나로 합쳐지면 교수는 자기 데이터가 남아 있는지 사라졌는지 알 수 없다.
 * 여기서는 실제 fetch 호출을 가로채 두 동작이 서로 다른 요청을 만든다는 것을 확인한다.
 */
type Call = { url: string; method: string; body: unknown };

let calls: Call[] = [];

function stubFetch(response: () => Response) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      return response();
    }),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  stubFetch(() => jsonResponse({ success: true, status: "ok", affectedCount: 2, retained: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pause and reset are not the same call", () => {
  it("sends different payloads to the settings endpoint", async () => {
    await updateMemorySettings("pause");
    await updateMemorySettings("reset");

    expect(calls).toHaveLength(2);
    const [pause, reset] = calls;

    expect(pause.url).toBe(MEMORY_SETTINGS_ENDPOINT);
    expect(reset.url).toBe(MEMORY_SETTINGS_ENDPOINT);
    expect(pause.method).toBe("PATCH");
    expect(reset.method).toBe("PATCH");

    expect(pause.body).toEqual({ action: "pause" });
    expect(reset.body).toEqual({ action: "reset" });
    expect(pause.body).not.toEqual(reset.body);
    expect(JSON.stringify(pause)).not.toBe(JSON.stringify(reset));
  });

  it("keeps resume distinct from both", async () => {
    await updateMemorySettings("pause");
    await updateMemorySettings("resume");
    await updateMemorySettings("reset");

    const bodies = calls.map((call) => JSON.stringify(call.body));
    expect(new Set(bodies).size).toBe(3);
  });

  it("builds a distinct payload per action at the builder level", () => {
    expect(memorySettingsPayload("pause")).not.toEqual(memorySettingsPayload("reset"));
    expect(memorySettingsPayload("pause")).not.toEqual(memorySettingsPayload("resume"));
    expect(memorySettingsPayload("resume")).not.toEqual(memorySettingsPayload("reset"));
  });

  it("reports reset as not retained while pause retains everything", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, status: "paused", affectedCount: 3, retained: true }),
    );
    const paused = await updateMemorySettings("pause");
    expect(paused.retained).toBe(true);

    stubFetch(() =>
      jsonResponse({ success: true, status: "reset", affectedCount: 3, retained: false }),
    );
    const reset = await updateMemorySettings("reset");
    expect(reset.retained).toBe(false);
  });
});

describe("delete uses its own endpoint and verb", () => {
  it("issues DELETE against the single-record endpoint", async () => {
    stubFetch(() => jsonResponse({ success: true, memoryId: "abc", status: "archived" }));
    await archiveInstructorMemory("abc");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${MEMORY_LIST_ENDPOINT}/abc`);
    expect(calls[0].url).not.toBe(MEMORY_SETTINGS_ENDPOINT);
  });

  it("is a different call from both pause and reset", async () => {
    stubFetch(() => jsonResponse({ success: true, memoryId: "abc", status: "archived" }));
    await archiveInstructorMemory("abc");
    const del = calls[0];

    stubFetch(() => jsonResponse({ success: true, status: "paused", retained: true }));
    await updateMemorySettings("pause");
    const pause = calls[0];

    stubFetch(() => jsonResponse({ success: true, status: "reset", retained: false }));
    await updateMemorySettings("reset");
    const reset = calls[0];

    expect(new Set([del.url, pause.url]).size).toBe(2);
    expect(new Set([del.method, pause.method, reset.method]).size).toBe(2);
  });
});

describe("list fetching", () => {
  it("normalizes the success payload", async () => {
    stubFetch(() =>
      jsonResponse({
        success: true,
        memories: [
          {
            id: "11111111-2222-4333-8444-555555555555",
            value: "감점하지 않는다",
            predicate: "grading.edge_case_rule",
            scope: "global",
            scopeId: null,
            status: "active",
            source: {
              table: "grading_chats",
              messageId: null,
              occurredAt: "2026-08-03T00:00:00.000Z",
              inputOrigin: null,
            },
          },
          { predicate: "no id — must be dropped" },
        ],
      }),
    );

    const records = await fetchInstructorMemories();
    expect(records).toHaveLength(1);
    expect(records[0].source.inputOrigin).toBeNull();
    expect(records[0].scopeId).toBeNull();
  });

  it("returns an empty array when the endpoint returns no records", async () => {
    stubFetch(() => jsonResponse({ success: true, memories: [] }));
    expect(await fetchInstructorMemories()).toEqual([]);
  });

  it("throws with the status code when the endpoint returns 500", async () => {
    stubFetch(() =>
      jsonResponse({ error: "FETCH_FAILED", message: "Failed to fetch instructor memory" }, 500),
    );
    await expect(fetchInstructorMemories()).rejects.toThrow(/500/);
  });
});

describe("screen wiring", () => {
  const screen = readFileSync(
    "components/instructor/memory/InstructorMemoryScreen.tsx",
    "utf8",
  );

  it("invalidates the shared memory query key after a write", () => {
    // 삭제 후 목록이 새로고침 없이 갱신되는 근거.
    expect(screen).toContain("invalidateQueries({ queryKey: memoryQueryKey })");
    expect(screen).toContain("qk.instructor.memory()");
    expect(qk.instructor.memory()).toEqual(["instructor-memory"]);
  });

  it("never hardcodes a query key array", () => {
    expect(screen).not.toMatch(/queryKey:\s*\[/);
  });

  it("uses useQuery for reads and useMutation for writes", () => {
    expect(screen).toContain("useQuery(");
    expect(screen).toContain("useMutation(");
    expect(screen).not.toMatch(/useEffect\s*\(/);
  });

  it("wires all three settings actions separately", () => {
    expect(screen).toContain('settingsMutation.mutate("pause")');
    expect(screen).toContain('settingsMutation.mutate("resume")');
    expect(screen).toContain('settingsMutation.mutate("reset")');
  });

  it("is not gated behind the memory injection flag", () => {
    // shadow 모드로 나가도 열람·삭제는 가능해야 한다.
    expect(screen).not.toContain("memoryInjectionEnabled");
    expect(screen).not.toContain("readMemoryFlags");
    expect(screen).not.toContain("MEMORY_INJECTION_ENABLED");
  });
});

describe("memory UI carries no hardcoded user-visible strings", () => {
  const files = [
    "components/instructor/memory/InstructorMemoryScreen.tsx",
    "components/instructor/memory/MemoryRecordList.tsx",
    "components/instructor/memory/MemoryRecordCard.tsx",
    "components/instructor/memory/MemoryConsentNotice.tsx",
    "components/instructor/memory/MemoryObservationControls.tsx",
    "components/instructor/memory/MemoryDeletionDisclosure.tsx",
    "app/(app)/instructor/memory/page.tsx",
  ];

  for (const file of files) {
    it(`has no Korean literal outside comments in ${file}`, () => {
      const stripped = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/[\uac00-\ud7a3]/);
    });
  }
});
