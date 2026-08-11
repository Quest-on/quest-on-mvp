import { NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { retireConsentSubject } from "@/lib/consent-retention";
import { logError } from "@/lib/logger";

export async function DELETE(): Promise<Response> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { error: deleteError } = await getSupabaseServer().auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: "ACCOUNT_DELETION_FAILED" }, { status: 500 });
  }

  try {
    const consentRetired = await retireConsentSubject(user.id);
    return NextResponse.json({ deleted: true, consentRetired });
  } catch (error) {
    // The account is already deleted. Leave the mapping intact so a retry can retire it.
    logError("[account] Consent subject retirement failed after account deletion", error, {
      path: "/api/user/account",
    });
    return NextResponse.json(
      { deleted: true, consentRetired: false, error: "CONSENT_RETIREMENT_PENDING" },
      { status: 202 }
    );
  }
}
