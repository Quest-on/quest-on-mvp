import { getSupabaseServer } from "@/lib/supabase-server";

export interface UserInfo {
  name: string;
  email: string;
}

/**
 * Supabase Auth 유저 정보와, 있으면 legacy profiles 테이블을 함께 조회합니다.
 *
 * @param userIds - Supabase UUID 배열
 * @returns userId → { name, email } Map
 */
export async function batchGetUserInfo(
  userIds: string[]
): Promise<Map<string, UserInfo>> {
  const result = new Map<string, UserInfo>();

  if (userIds.length === 0) return result;

  const uniqueIds = [...new Set(userIds)];

  try {
    const supabase = getSupabaseServer();
    const { data: authData } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    const authUserMap = new Map(
      (authData?.users ?? [])
        .filter((user) => uniqueIds.includes(user.id))
        .map((user) => [user.id, user]),
    );

    const profilesResult = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", uniqueIds);
    const profileNameMap = new Map<string, string>();
    if (!profilesResult.error) {
      for (const profile of profilesResult.data ?? []) {
        profileNameMap.set(profile.id, profile.display_name ?? "");
      }
    }

    for (const id of uniqueIds) {
      const user = authUserMap.get(id);
      const metadata = user?.user_metadata as Record<string, unknown> | undefined;
      const metadataName =
        stringMetadata(metadata?.display_name) ||
        stringMetadata(metadata?.full_name) ||
        stringMetadata(metadata?.name);
      const profileName = profileNameMap.get(id)?.trim();

      result.set(id, {
        name: profileName || metadataName || `User ${id.slice(0, 8)}`,
        email: user?.email || `${id}@example.com`,
      });
    }
  } catch {
    for (const id of uniqueIds) {
      result.set(id, {
        name: `User ${id.slice(0, 8)}`,
        email: `${id}@example.com`,
      });
    }
  }

  return result;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
