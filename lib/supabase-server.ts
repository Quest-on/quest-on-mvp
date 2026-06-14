import { assertSupabaseTarget } from "@/lib/env-target";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a fresh Supabase server client using the service role key.
 * For use in API routes and server-side code only.
 *
 * ⚠️  SERVICE ROLE — bypasses RLS entirely.
 * Use only for:
 *   - Admin operations (admin panel routes)
 *   - System-level tasks (AI grading, RAG processing, embeddings)
 *   - Cross-user data access (instructor viewing student sessions/grades)
 *   - Bulk operations (exam start/end modifying all sessions)
 *
 * For user-scoped operations where RLS should be enforced,
 * use getSupabaseRLS() from lib/supabase-server-rls.ts instead.
 *
 * P0-3: No singleton — serverless warm starts can retain stale module-level
 * state across invocations, preventing key rotation from taking effect.
 * Supabase JS v2 is fetch-based so client creation cost is negligible.
 */
export function getSupabaseServer(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  assertSupabaseTarget({
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
    databaseUrl: process.env.DATABASE_URL,
    context: "server",
  });

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}
