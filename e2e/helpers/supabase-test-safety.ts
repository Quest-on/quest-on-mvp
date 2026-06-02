type EnvLike = Record<string, string | undefined>;

const REMOTE_TESTS_FLAG = "ALLOW_REMOTE_SUPABASE_TESTS";
const REMOTE_TESTS_ALLOWLIST = "SUPABASE_TEST_PROJECT_REF_ALLOWLIST";

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function getSupabaseProjectRef(hostname: string): string | null {
  const normalized = hostname.toLowerCase();
  const suffix = ".supabase.co";
  if (!normalized.endsWith(suffix)) return null;
  return normalized.slice(0, -suffix.length) || null;
}

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function assertSafeTestSupabaseUrl(
  rawUrl: string | undefined,
  env: EnvLike = process.env
): void {
  if (!rawUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL for tests. Point tests at local Supabase via .env.test."
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL for tests: ${rawUrl}`);
  }

  if (isLoopbackHost(url.hostname)) return;

  const projectRef = getSupabaseProjectRef(url.hostname);
  const allowRemoteTests = env[REMOTE_TESTS_FLAG] === "true";
  const allowlist = parseAllowlist(env[REMOTE_TESTS_ALLOWLIST]);

  if (projectRef && allowRemoteTests && allowlist.has(projectRef)) {
    return;
  }

  if (projectRef) {
    throw new Error(
      [
        `Refusing to run destructive E2E/API tests against remote Supabase project "${projectRef}".`,
        "Use local Supabase in .env.test, or explicitly set",
        `${REMOTE_TESTS_FLAG}=true and ${REMOTE_TESTS_ALLOWLIST}=${projectRef}`,
        "only for a disposable test project.",
      ].join(" ")
    );
  }

  throw new Error(
    `Refusing to run destructive E2E/API tests against non-local Supabase host "${url.hostname}".`
  );
}
