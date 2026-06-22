export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sweepAllPastDeadlineAssignments } from "@/lib/assignment-deadline-sweep";
import { logError } from "@/lib/logger";

/**
 * Assignment deadline auto-submit sweeper.
 *
 * For assignment sessions that started (in_progress / quiz_pending) but were
 * not submitted before the deadline, finalize submission server-side and set
 * auto_submitted=true so instructors can grade and see the deadline signal.
 *
 * Authentication: Vercel Cron bearer token CRON_SECRET.
 */

function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.VERCEL !== "1";
  }
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (process.env.ASSIGNMENT_DEADLINE_SWEEP_DISABLED === "1") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  try {
    const result = await sweepAllPastDeadlineAssignments({ maxExams: 20 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError("[assignment-deadline-sweep] Cron run failed", error, {
      path: "/api/cron/assignment-deadline-sweep",
    });
    return NextResponse.json({ error: "SWEEP_FAILED" }, { status: 500 });
  }
}
