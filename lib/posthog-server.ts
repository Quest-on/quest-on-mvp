import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { postHogConfig } from "@/lib/posthog-config";
import { ANALYTICS_CHOICE_COOKIE } from "@/lib/website-analytics";

const PRODUCT_EVENTS = new Set([
  "signup_completed", "intake_submitted", "demo_created", "demo_answered",
  "demo_graded_viewed", "first_publish", "first_student_submission",
]);

export function milestoneUuid(environment: string, userId: string, event: string): string {
  const hex = createHash("sha256").update(`${environment}:${userId}:${event}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Best-effort analytics only; native product records remain authoritative. */
export async function captureProductMilestone(userId: string, event: string, role: string, timestamp?: Date): Promise<void> {
  const config = postHogConfig();
  if (!config || !PRODUCT_EVENTS.has(event) ||
      (role !== "instructor" && !(event === "signup_completed" && role === "student"))) return;
  try {
    if ((await cookies()).get(ANALYTICS_CHOICE_COOKIE)?.value !== "granted") return;
    after(async () => {
      const client = new PostHog(config.token, {
        host: config.host, requestTimeout: 2000, fetchRetryCount: 0,
        disableGeoip: true, enableExceptionAutocapture: false,
      });
      try {
        await client.captureImmediate({
          distinctId: userId, event,
          uuid: milestoneUuid(config.environment, userId, event), timestamp,
          properties: { role, environment: config.environment, event_source: "server" },
        });
      } catch { console.warn("[analytics] Product milestone delivery failed"); }
      finally { await client.shutdown(2500).catch(() => {}); }
    });
  } catch { /* no request context or unavailable analytics cannot break the product */ }
}

export async function captureVerifiedSignup(user: { id: string; created_at?: string; email_confirmed_at?: string }, role: string) {
  const created = Date.parse(user.created_at ?? "");
  const confirmed = Date.parse(user.email_confirmed_at ?? "");
  const age = Date.now() - confirmed;
  if (!Number.isFinite(created) || !Number.isFinite(confirmed) || confirmed < created ||
      age < 0 || age > 86400000 || confirmed - created > 86400000) return;
  await captureProductMilestone(user.id, "signup_completed", role, new Date(confirmed));
}
