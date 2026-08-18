"use client";

import { useEffect, useState } from "react";
import {
  fetchEnabledProviders,
  UNRESOLVED,
  type ProviderAvailability,
} from "@/lib/oauth-providers";

/**
 * 로그인·가입 화면이 쓰는 provider 가용성.
 *
 * 마운트 때 한 번 묻는다. 실패하면 `enabled: null` 이라 버튼은 원래대로
 * 동작한다 — 우리가 막는 게 아니라 Supabase 가 판단한다.
 */
export function useOAuthProviders(): ProviderAvailability {
  const [state, setState] = useState<ProviderAvailability>(UNRESOLVED);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    fetchEnabledProviders(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      controller.signal
    ).then((next) => {
      if (alive) setState(next);
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return state;
}
