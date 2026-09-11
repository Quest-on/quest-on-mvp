/**
 * Supabase 에서 실제로 켜져 있는 OAuth provider 를 읽는다.
 *
 * 이게 없으면 버튼이 막다른 길로 보낸다. staging 에서 실제로 겪었다 —
 * "Google로 계속하기" 를 누르면 supabase-js 가 브라우저를 통째로
 * `/auth/v1/authorize` 로 넘기는데, provider 가 꺼져 있으면 거기서 이렇게
 * 끝난다.
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * 앱 도메인 밖이라 돌아올 방법도, 가로챌 방법도 없다. 리다이렉트가 이미
 * 일어난 뒤라 `signInWithOAuth` 의 반환값으로도 못 잡는다. 그래서 누르기
 * 전에 알아야 한다.
 *
 * `/auth/v1/settings` 는 anon 키로 읽을 수 있고 활성 provider 를 그대로
 * 알려준다. 환경마다 다른 설정을 코드에 박지 않고 실제 값을 묻는다.
 */

export type OAuthProvider = "google" | "azure";

const SETTINGS_PATH = "/auth/v1/settings";

/** 조회 실패와 "꺼져 있음" 은 다르다. 실패 시 버튼을 막지 않는다. */
export type ProviderAvailability = {
  /** 조회가 끝났는가. 끝나기 전에는 버튼 상태를 바꾸지 않는다. */
  resolved: boolean;
  /** 조회에 성공했을 때만 채워진다. */
  enabled: Record<OAuthProvider, boolean> | null;
};

export const UNRESOLVED: ProviderAvailability = { resolved: false, enabled: null };

/**
 * 조회에 실패하면 `enabled: null` 을 준다.
 *
 * 네트워크가 잠깐 끊겼다고 로그인 버튼을 잠그면, 멀쩡한 provider 를 우리가
 * 막는 꼴이다. 모르면 그냥 두고 Supabase 가 판단하게 한다 — 원래 동작이다.
 */
export async function fetchEnabledProviders(
  supabaseUrl: string | undefined,
  anonKey: string | undefined,
  signal?: AbortSignal
): Promise<ProviderAvailability> {
  if (!supabaseUrl || !anonKey) return { resolved: true, enabled: null };

  try {
    const res = await fetch(`${supabaseUrl}${SETTINGS_PATH}`, {
      headers: { apikey: anonKey },
      signal,
    });
    if (!res.ok) return { resolved: true, enabled: null };

    const body: unknown = await res.json();
    const external = (body as { external?: Record<string, unknown> })?.external;
    if (!external || typeof external !== "object") {
      return { resolved: true, enabled: null };
    }

    return {
      resolved: true,
      enabled: {
        google: external.google === true,
        azure: external.azure === true,
      },
    };
  } catch {
    return { resolved: true, enabled: null };
  }
}

/**
 * 버튼을 잠글 것인가.
 *
 * 확실히 꺼져 있을 때만 잠근다. 모르면(`null`) 잠그지 않는다.
 */
export function isProviderUnavailable(
  availability: ProviderAvailability,
  provider: OAuthProvider
): boolean {
  if (!availability.resolved || !availability.enabled) return false;
  return availability.enabled[provider] === false;
}
