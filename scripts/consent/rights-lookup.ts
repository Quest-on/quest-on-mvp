import { randomUUID } from "crypto";
import { lookupConsentRights } from "@/lib/consent-audit";

function readVerifiedUserId(args: string[]): string {
  const index = args.indexOf("--user-id");
  const userId = index >= 0 ? args[index + 1] : undefined;
  if (!userId || userId.startsWith("--")) {
    throw new Error("--user-id <verified-id> is required");
  }
  return userId;
}

async function main(): Promise<void> {
  const userId = readVerifiedUserId(process.argv.slice(2));
  const caseId = randomUUID();
  const { count } = await lookupConsentRights(userId);
  // Operator output is deliberately non-identifying: only the case ID and count.
  process.stdout.write(`${JSON.stringify({ caseId, count })}\n`);
}

main().catch(() => {
  process.stderr.write("Rights lookup failed.\n");
  process.exitCode = 1;
});
