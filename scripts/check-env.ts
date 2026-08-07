/**
 * 환경변수 감사 스크립트.
 *
 *   npm run env:check -- --env staging --file .env.staging
 *   npm run env:check -- --env production          # 현재 셸 환경을 검사
 *
 * lib/env-manifest.ts 를 그대로 쓴다. 값은 읽되 **출력하지 않는다**.
 * 필수 누락 / 금지 변수 존재가 있으면 exit 1.
 */

import { readFileSync } from "fs";
import { APP_ENVS, type AppEnv, resolveAppEnv } from "../lib/app-env";
import {
  ENV_MANIFEST,
  auditEnv,
  isEnvAuditHealthy,
  parseEnvFile,
} from "../lib/env-manifest";

function parseArgs(argv: string[]): { env?: string; file?: string } {
  const out: { env?: string; file?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, inlineValue] = argv[i].split("=");
    const value = inlineValue ?? argv[i + 1];
    if (flag === "--env") out.env = value;
    if (flag === "--file") out.file = value;
  }
  return out;
}


function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.env && !(APP_ENVS as readonly string[]).includes(args.env)) {
    console.error(`--env must be one of: ${APP_ENVS.join(", ")}`);
    process.exit(2);
  }

  let source: Record<string, string | undefined> = process.env;
  if (args.file) {
    try {
      source = parseEnvFile(readFileSync(args.file, "utf8"));
    } catch {
      console.error(`Cannot read env file: ${args.file}`);
      process.exit(2);
    }
  }

  const appEnv: AppEnv = (args.env as AppEnv) ?? resolveAppEnv(source);
  const audit = auditEnv(source, appEnv);

  console.log(`env: ${appEnv}${args.file ? ` (file: ${args.file})` : " (process env)"}`);
  console.log(`checked: ${ENV_MANIFEST.length} variables`);

  if (audit.missingRequired.length > 0) {
    console.error(`MISSING REQUIRED: ${audit.missingRequired.join(", ")}`);
  }
  if (audit.forbiddenPresent.length > 0) {
    console.error(`FORBIDDEN IN ${appEnv.toUpperCase()}: ${audit.forbiddenPresent.join(", ")}`);
  }
  if (audit.missingRecommended.length > 0) {
    console.log(`missing recommended: ${audit.missingRecommended.join(", ")}`);
  }

  if (!isEnvAuditHealthy(audit)) {
    process.exit(1);
  }
  console.log("OK");
}

main();
