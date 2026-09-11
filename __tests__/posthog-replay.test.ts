import { describe, expect, it } from "vitest";
import { sessionReplayConfig, replayProperties } from "@/lib/posthog-replay";
import { ANALYTICS_CHOICE_KEY, readAnalyticsChoice } from "@/lib/website-analytics";

describe("session replay data boundaries", () => {
  it("redacts record identifiers and query/hash secrets from replay URLs", () => {
    const mask = (request: { name: string }) => sessionReplayConfig.maskCapturedNetworkRequestFn!({ ...request, duration: 0, entryType: "navigation", startTime: 0 });
    expect(mask({ name: "https://quest-on.app/exam/secret?email=private@example.com#answer" }))
      .toEqual({ name: "https://quest-on.app/exam/[id]", duration: 0, entryType: "navigation", startTime: 0 });
    expect(mask({ name: "https://quest-on.app/auth/callback?code=secret" })).toBeNull();
    expect(mask({ name: "https://quest-on.app/api/chat" })).toBeNull();
  });
  it("keeps replay layout while dropping user attributes and document links", () => {
    const mask = sessionReplayConfig.maskAttributeFn!;
    for (const name of ["title", "alt", "value", "data-answer", "aria-label", "id", "src", "href"]) {
      expect(mask(name, "private answer@example.com")).toBe("");
    }
    expect(mask("class", "flex gap-2")).toBe("flex gap-2");
    expect(mask("style", "width: 50%; background-image: url(private); content: 'answer'"))
      .toBe("width: 50%");
  });
  it("retains masked rrweb snapshots without allowing arbitrary analytics properties", () => {
    const snapshot = [{ type: 2, data: { node: { textContent: "******" } } }];
    const data = replayProperties({ $snapshot_data: snapshot, $session_id: "session", token: "public", answer: "private", $current_url: "secret" }, "staging");
    expect(data).toEqual({ $snapshot_data: snapshot, $session_id: "session", token: "public", environment: "staging" });
    expect(data.$snapshot_data).toBe(snapshot);
  });
  it("renews earlier grants, preserves refusals, and accepts the current disclosure", () => {
    const storage = (old: string | null, current: string | null = null) => ({ getItem: (key: string) => key === ANALYTICS_CHOICE_KEY ? current : old });
    expect(readAnalyticsChoice(storage("granted"))).toBeNull();
    expect(readAnalyticsChoice(storage("denied"))).toBe("denied");
    expect(readAnalyticsChoice(storage("denied", "granted"))).toBe("granted");
  });
});
