import { randomUUID } from "crypto";
import { buildRightsLookupPlan, buildRightsLookupReceipt } from "@/lib/consent-audit";

/**
 * 권리요청(열람·정정·삭제) 대응 보조 도구.
 *
 * 이 스크립트는 **DB 에 붙지 않는다.** 앱 코드가 동의 감사 테이블에 접근하면
 * `019` 가 세운 접근분리가 무너진다. 대신 조회에 필요한 `subject_ref` 와
 * 실행할 SQL 을 만들어 주고, 실제 조회는 승인된 operator 가 자신의
 * `consent_auditor` 권한(`CONSENT_AUDIT_DATABASE_URL`)으로 수행한다.
 *
 * 사용:
 *   npx tsx scripts/consent/rights-lookup.ts --user-id <verified-id>
 *
 * `--user-id` 는 **신원 확인이 끝난 값**이어야 한다. 요청자가 주장한 값을
 * 그대로 넣으면 타인의 동의 이력을 조회하게 된다.
 */

function readVerifiedUserId(args: string[]): string {
  const index = args.indexOf("--user-id");
  const userId = index >= 0 ? args[index + 1] : undefined;
  if (!userId || userId.startsWith("--")) {
    throw new Error("--user-id <verified-id> is required");
  }
  return userId;
}

function main(): void {
  const userId = readVerifiedUserId(process.argv.slice(2));
  const caseId = randomUUID();
  const plan = buildRightsLookupPlan(userId);

  // subject_ref 는 조회에 필요하므로 operator 화면에는 나가지만,
  // 수령증에는 남기지 않는다. 처리 기록이 새 개인정보가 되면 안 된다.
  process.stdout.write(`case: ${caseId}\n`);
  process.stdout.write(`subject_ref: ${plan.subjectRef}\n\n`);
  for (const statement of plan.statements) {
    process.stdout.write(`${statement}\n\n`);
  }
  process.stdout.write(
    `실행 후 결과 행 수를 아래 형식으로 기록한다:\n` +
      `${buildRightsLookupReceipt(caseId, 0).replace("rows=0", "rows=<행 수>")}\n`,
  );
}

try {
  main();
} catch {
  process.stderr.write("Rights lookup plan generation failed.\n");
  process.exitCode = 1;
}
