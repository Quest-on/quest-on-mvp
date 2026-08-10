import { PrismaClient } from "@prisma/client";
import { deriveSubjectRef } from "@/lib/consent-subject-ref";

type SubjectMapRow = { subject_ref: string };
type CountRow = { count: bigint | number };

/**
 * Rights-request lookup is for an approved operator environment only. It uses
 * CONSENT_AUDIT_DATABASE_URL and must never run in the Vercel runtime.
 */
export async function lookupConsentRights(userId: string): Promise<{ count: number }> {
  const databaseUrl = process.env.CONSENT_AUDIT_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("CONSENT_AUDIT_DATABASE_URL is required in the operator environment.");
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const mappings = await prisma.$queryRaw<SubjectMapRow[]>`
      SELECT subject_ref
      FROM consent_subject_map
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    // An active account has a mapping. A retired account has no mapping, so the
    // approved custodian HMAC key re-derives its pseudonymous ledger reference.
    const subjectRef = mappings[0]?.subject_ref ?? deriveSubjectRef(userId);
    const counts = await prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM consent_records
      WHERE subject_ref = ${subjectRef}
    `;

    return { count: Number(counts[0]?.count ?? 0) };
  } finally {
    await prisma.$disconnect();
  }
}
