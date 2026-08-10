import { createHash } from "crypto";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type OnboardingMessages = {
  consent: {
    ageOver14: { label: string };
    terms: { label: string };
  };
};

type LegalMessages = {
  terms: JsonValue;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function buildCanonicalInput() {
  const koOnboarding = readJson<OnboardingMessages>("messages/ko/onboarding.json");
  const enOnboarding = readJson<OnboardingMessages>("messages/en/onboarding.json");
  const koLegal = readJson<LegalMessages>("messages/ko/legal.json");
  const enLegal = readJson<LegalMessages>("messages/en/legal.json");

  return {
    schemaVersion: 1,
    controllerType: "platform",
    requiredConsents: [
      {
        consentKey: "age_over_14",
        labelKo: koOnboarding.consent.ageOver14.label,
        labelEn: enOnboarding.consent.ageOver14.label,
      },
      {
        consentKey: "terms",
        labelKo: koOnboarding.consent.terms.label,
        labelEn: enOnboarding.consent.terms.label,
        href: "/legal/terms",
        termsKo: koLegal.terms,
        termsEn: enLegal.terms,
      },
    ],
  };
}

/**
 * Canonical serialization prevents key order or whitespace changes from changing a
 * release hash when the displayed policy text did not change, which would otherwise
 * force every user to re-consent.
 */
export function canonicalize(value: JsonValue): string {
  if (typeof value === "string") {
    return JSON.stringify(value.replace(/\r\n?/g, "\n").normalize("NFC"));
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${canonicalize(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

export function computeContentHash(input: JsonValue = buildCanonicalInput()): string {
  return createHash("sha256").update(canonicalize(input), "utf8").digest("hex");
}

function readSeedHash(sqlPath: string): string | null {
  const sql = readFileSync(sqlPath, "utf8");
  return sql.match(/VALUES\s*\(\s*'[^']+'\s*,\s*'([0-9a-f]{64})'/is)?.[1] ?? null;
}

function main() {
  const [mode, sqlPath] = process.argv.slice(2);
  const input = buildCanonicalInput();
  const contentHash = computeContentHash(input);

  if (mode === "--print") {
    console.log(canonicalize(input));
    console.log(contentHash);
    return;
  }

  if (mode === "--verify" && sqlPath) {
    const seededHash = readSeedHash(sqlPath);
    if (seededHash !== contentHash) {
      console.error(`Consent policy release hash mismatch: expected ${contentHash}, found ${seededHash ?? "none"}`);
      process.exitCode = 1;
    }
    return;
  }

  console.error("Usage: npx tsx scripts/consent-policy-release.ts --print | --verify <sql-path>");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
