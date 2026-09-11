import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postHogConfig, sanitizePostHogProperties, syncAnalyticsIdentity } from "@/lib/posthog-config";

const mocks = vi.hoisted(() => ({
  choice: "granted", capture: vi.fn(), shutdown: vi.fn(), tasks: [] as Array<() => Promise<void>>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.choice }) }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => { mocks.tasks.push(task); } }));
vi.mock("posthog-node", () => ({ PostHog: class { captureImmediate = mocks.capture; shutdown = mocks.shutdown; } }));
import { captureProductMilestone, captureVerifiedSignup, milestoneUuid } from "@/lib/posthog-server";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_testonly");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
  mocks.choice = "granted";
  mocks.tasks = [];
  mocks.capture.mockReset().mockResolvedValue(undefined);
  mocks.shutdown.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("PostHog data and identity boundaries", () => {
  it("rejects local collection, missing configuration and unapproved hosts", () => {
    expect(postHogConfig()?.environment).toBe("staging");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    expect(postHogConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://other.example");
    expect(postHogConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    expect(postHogConfig()).toBeNull();
  });
  it("removes private SDK defaults and nested initial/person properties", () => {
    expect(sanitizePostHogProperties({
      distinct_id: "user-id", $current_url: "https://quest-on.app/exam/SECRET?email=a@b.com",
      $pathname: "/exam/SECRET", $referrer: "https://mail.example/inbox?token=secret",
      $set: {email: "a@b.com", $initial_current_url: "https://quest-on.app/?token=secret", utm_campaign: "outreach_005"},
      $set_once: {$initial_utm_campaign: "person@example.com"}, answer: "private answer", environment: "staging",
    })).toEqual({
      distinct_id: "user-id", $current_url: "https://quest-on.app/exam/[id]", $referrer: "https://mail.example",
      $set: {$initial_current_url: "https://quest-on.app/", utm_campaign: "outreach_005"},
      $set_once: {}, environment: "staging",
    });
  });
  it("links anonymous visits but resets on account switches and logout", () => {
    let identity: string | null = null;
    const client = {get_property: () => identity, identify: vi.fn((id: string) => { identity = id; }), reset: vi.fn(() => { identity = null; })};
    syncAnalyticsIdentity(client, "a");
    syncAnalyticsIdentity(client, "a");
    expect(client.identify).toHaveBeenCalledTimes(1);
    expect(client.reset).not.toHaveBeenCalled();
    syncAnalyticsIdentity(client, "b");
    expect(client.reset).toHaveBeenCalledTimes(1);
    syncAnalyticsIdentity(client, null);
    expect(client.reset).toHaveBeenCalledTimes(2);
    expect(identity).toBeNull();
  });
});

describe("verified server milestones", () => {
  it("does not export opt-outs, student disclosures or student events", async () => {
    mocks.choice = "denied";
    await captureProductMilestone("u", "demo_created", "instructor");
    mocks.choice = "granted";
    await captureProductMilestone("u", "student_disclosure_ack", "student");
    await captureProductMilestone("u", "demo_created", "student");
    expect(mocks.tasks).toHaveLength(0);
  });
  it("uses stable deduplication IDs separated by environment and sends after the response", async () => {
    await captureProductMilestone("u", "demo_created", "instructor");
    expect(mocks.capture).not.toHaveBeenCalled();
    await mocks.tasks[0]();
    const payload = mocks.capture.mock.calls[0][0];
    expect(payload).toMatchObject({distinctId: "u", event: "demo_created", properties: {environment: "staging", role: "instructor", event_source: "server"}});
    expect(payload.uuid).toBe(milestoneUuid("staging", "u", "demo_created"));
    expect(payload.uuid).not.toBe(milestoneUuid("production", "u", "demo_created"));
    expect(payload.uuid).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  });
  it("does not let delivery failure break a successful product response", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.capture.mockRejectedValue(new Error("Unavailable"));
    await captureProductMilestone("u", "demo_created", "instructor");
    await expect(mocks.tasks[0]()).resolves.toBeUndefined();
    expect(mocks.shutdown).toHaveBeenCalled();
  });
  it("does not count unverified or old accounts as a signup", async () => {
    const recent = new Date(Date.now() - 60000).toISOString();
    const old = new Date(Date.now() - 86400000 * 30).toISOString();
    await captureVerifiedSignup({id: "u", created_at: recent}, "instructor");
    await captureVerifiedSignup({id: "u", created_at: old, email_confirmed_at: old}, "instructor");
    expect(mocks.tasks).toHaveLength(0);
    await captureVerifiedSignup({id: "u", created_at: recent, email_confirmed_at: recent}, "instructor");
    await mocks.tasks[0]();
    expect(mocks.capture.mock.calls[0][0]).toMatchObject({event: "signup_completed", timestamp: new Date(recent)});
  });
});
