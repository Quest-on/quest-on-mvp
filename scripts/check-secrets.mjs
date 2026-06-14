#!/usr/bin/env node
/**
 * Secret scanner — git-tracked source/docs/config 전체를 검사한다.
 *
 * 차단(exit 1) 대상:
 *   1. 실제 Supabase service-role JWT (payload role === "service_role" 이고
 *      iss !== "supabase-demo" — 로컬/CI 데모 키는 허용).
 *   2. 추적되면 안 되는 실제 secret env 파일(.env, .env.local, .env.*.local,
 *      .env.production 등). .env.example / .env.test / .env.sample 은 허용.
 *
 * 사용: node scripts/check-secrets.mjs
 * CI(.github/workflows/secret-scan.yml)와 로컬에서 동일하게 실행된다.
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const ALLOWED_ENV_FILES = new Set([
  ".env.example",
  ".env.test",
  ".env.sample",
]);

// 실제 secret 을 담는 env 파일 이름은 추적되면 안 된다.
function isDisallowedEnvFile(path) {
  const base = path.split("/").pop() || path;
  if (ALLOWED_ENV_FILES.has(base)) return false;
  return (
    base === ".env" ||
    base === ".env.local" ||
    base === ".env.production" ||
    /^\.env\..*\.local$/.test(base) ||
    base === ".env.production.local"
  );
}

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function decodeJwtPayload(token) {
  try {
    const mid = token.split(".")[1];
    const json = Buffer.from(mid, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function listTrackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function isProbablyText(path) {
  // 명백한 바이너리/대용량 자산은 건너뛴다.
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp4|mov|wasm)$/i.test(path)) {
    return false;
  }
  try {
    const st = statSync(path);
    if (st.size > 4 * 1024 * 1024) return false;
  } catch {
    return false;
  }
  return true;
}

const findings = [];
const files = listTrackedFiles();

for (const file of files) {
  if (file === "scripts/check-secrets.mjs") continue; // self (정규식 리터럴 포함)

  if (isDisallowedEnvFile(file)) {
    findings.push({ file, kind: "tracked-secret-env-file", detail: "실제 secret env 파일이 git에 추적됨" });
    continue;
  }

  if (!isProbablyText(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const matches = content.match(JWT_RE);
  if (!matches) continue;
  for (const token of matches) {
    const payload = decodeJwtPayload(token);
    if (!payload) continue;
    const role = payload.role;
    const iss = payload.iss;
    if (role === "service_role" && iss !== "supabase-demo") {
      findings.push({
        file,
        kind: "real-service-role-jwt",
        detail: `service_role JWT (iss=${iss ?? "?"}, ref=${payload.ref ?? "?"}) 가 소스에 하드코딩됨`,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("❌ Secret scan 실패 — 다음 항목을 제거/회전하세요:\n");
  for (const f of findings) {
    console.error(`  - [${f.kind}] ${f.file}: ${f.detail}`);
  }
  console.error(
    "\nservice-role 키는 절대 소스에 두지 말고 환경변수로만 주입하세요. 이미 커밋된 키는 즉시 rotate 해야 합니다 (git 히스토리에 남음)."
  );
  process.exit(1);
}

console.log(`✅ Secret scan 통과 — 추적 파일 ${files.length}개에서 실제 service-role 키/secret env 파일 미발견.`);
