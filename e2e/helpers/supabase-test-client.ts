import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";
import { assertSafeTestSupabaseUrl } from "./supabase-test-safety";

// Load test env
dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });

let _client: SupabaseClient | null = null;
const FETCH_RETRY_DELAYS_MS = [200, 400, 800, 1200];

function isRetryableFetchError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");

  return /fetch failed|ECONNREFUSED|ECONNRESET|socket|network/i.test(message);
}

async function retryingFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableFetchError(error) ||
        attempt === FETCH_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt])
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function createTestSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !key) {
    throw new Error(
      "Missing test Supabase env vars. Run `supabase start` and check .env.test"
    );
  }
  assertSafeTestSupabaseUrl(url);

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: retryingFetch,
    },
  });
}

/**
 * Returns a Supabase client configured for the local test DB.
 * Uses service_role key for full access (no RLS).
 */
export function getTestSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createTestSupabaseClient();
  return _client;
}

export async function waitForTestSupabaseReady(
  timeoutMs: number = 15_000
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const supabase = createTestSupabaseClient();
      const { error } = await supabase.from("exams").select("id").limit(1);

      if (!error || !isRetryableFetchError(error.message)) {
        return;
      }

      lastError = error;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Supabase test endpoint not ready within ${timeoutMs}ms: ${message}`);
}
