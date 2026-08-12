import type { AppUser } from "@/lib/supabase-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

/** Canonical instructor identity used by every memory operation. */
export type OwnerId = string;

/** Resolve ownership from an already-authenticated HTTP request user. */
export function ownerFromUser(user: Pick<AppUser, "id">): OwnerId {
  return user.id;
}

/**
 * Resolve ownership for signed workers and cron jobs, where no currentUser()
 * exists. A missing exam has no usable owner and resolves to null.
 */
export async function ownerFromExam(examId: string): Promise<OwnerId | null> {
  const { data, error } = await getSupabaseServer()
    .from("exams")
    .select("instructor_id")
    .eq("id", examId)
    .maybeSingle();

  if (error) {
    throw new Error(`exam owner lookup failed: ${error.message}`);
  }

  const instructorId = (data as { instructor_id?: unknown } | null)?.instructor_id;
  return typeof instructorId === "string" && instructorId.length > 0 ? instructorId : null;
}
