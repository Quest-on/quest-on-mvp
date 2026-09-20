"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Unlink } from "lucide-react";
import toast from "react-hot-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { qk } from "@/lib/query-keys";
import { useOAuthProviders } from "@/lib/use-oauth-providers";
import { isProviderUnavailable } from "@/lib/oauth-providers";
import type { LinkableProvider } from "@/lib/account-link-intent";
import { createSupabaseClient } from "@/lib/supabase-client";
import { getAccountLinkCallbackUrl } from "@/lib/auth-redirect";

type Identity = {
  /** 비밀번호 수단은 identity 행이 없어 null — 언링크 대신 비밀번호 카드로 (#408) */
  id: string | null;
  provider: string;
  email: string | null;
  createdAt: string | null;
};

/**
 * provider 표시명. 고유명사라 번역하지 않는다 — "Google" 은 어느 언어에서도 Google.
 * `settings/page.tsx` 의 연결 완료 토스트도 이걸 쓴다 — 쿼리스트링 raw 값이 그대로
 * 사용자 문구에 나가면 안 된다(red-team WATCH).
 */
export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "Kakao",
  email: "Email",
  azure: "Microsoft",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

/**
 * 계정에 붙은 로그인 수단 (PR-2 / AC-23).
 *
 * 한 계정에 카카오·Google·이메일을 모두 붙여 어느 방법으로 들어와도 같은
 * 계정이 되게 한다. 인터뷰 결론(스펙 AC-15c): 이미 갈라진 계정은 합치지 않고,
 * 앞으로 갈라지는 것만 여기서 막는다.
 *
 * 연결 순서: (1) 서버에 의도 쿠키를 발급받는다 (2) **브라우저 SDK** 가
 * `linkIdentity()` 로 provider 로 나간다. SDK 를 브라우저에서 부르는 이유는
 * PKCE verifier — SDK 가 자기 쿠키에 쓰는데 서버에서 부르면 그 쿠키가 응답에
 * 안 실려 콜백 교환이 실패한다. 로그인 버튼과 같은 패턴이다.
 * 언링크는 수단이 2개 이상일 때만 — 마지막 하나를 떼면 다시 못 들어온다.
 */
export function LinkedAccountsCard({ userId }: { userId: string }) {
  const t = useTranslations("auth.settings.linkedAccounts");
  const qc = useQueryClient();
  const providers = useOAuthProviders();
  const [pending, setPending] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.account.identities(userId),
    queryFn: async () => {
      const res = await fetch("/api/account/identities");
      if (!res.ok) throw new Error("identities unavailable");
      return (await res.json()) as { identities: Identity[] };
    },
  });

  const link = useMutation({
    mutationFn: async (provider: LinkableProvider) => {
      const res = await fetch("/api/account/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("intent failed");

      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: getAccountLinkCallbackUrl(window.location.origin) },
      });
      if (error) throw error;
      // 여기서 브라우저가 떠난다. 돌아오면 /auth/link-callback → /settings?linked=…
    },
    onMutate: (provider) => setPending(provider),
    onError: () => {
      setPending(null);
      toast.error(t("linkFailed"));
    },
  });

  const unlink = useMutation({
    mutationFn: async (identityId: string) => {
      const res = await fetch("/api/account/identities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId }),
      });
      if (res.status === 409) throw new Error("last");
      if (!res.ok) throw new Error("unlink failed");
    },
    onSuccess: () => {
      toast.success(t("unlinked"));
      qc.invalidateQueries({ queryKey: qk.account.identities(userId) });
    },
    onError: (e) => {
      toast.error(e.message === "last" ? t("cannotUnlinkLast") : t("unlinkFailed"));
    },
  });

  const identities = query.data?.identities ?? [];
  const linked = new Set(identities.map((i) => i.provider));
  const canUnlink = identities.length >= 2;
  const linkable = (["google", "kakao"] as const).filter((p) => !linked.has(p));

  return (
    <Card id="linked-accounts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {t("loadError")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border" aria-label={t("listLabel")}>
            {identities.map((identity) => (
              <li
                key={identity.id ?? `password:${identity.provider}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {PROVIDER_LABEL[identity.provider] ?? identity.provider}
                  </p>
                  {identity.email ? (
                    <p className="type-hint truncate">{identity.email}</p>
                  ) : null}
                </div>
                {identity.id === null ? (
                  // 비밀번호는 identity 가 아니라 여기서 못 떼다. 변경은 위 카드에서.
                  <p className="type-hint">{t("passwordManagedAbove")}</p>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canUnlink || unlink.isPending}
                    onClick={() => unlink.mutate(identity.id as string)}
                    aria-label={t("unlinkAria", {
                      provider: PROVIDER_LABEL[identity.provider] ?? identity.provider,
                    })}
                  >
                    {unlink.isPending && unlink.variables === identity.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unlink className="w-4 h-4" />
                    )}
                    {t("unlink")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* 마지막 수단은 못 뗀다는 걸 버튼 밖에 적는다 — disabled 안의 글은 흐려진다. */}
        {!query.isPending && !canUnlink ? (
          <p className="type-hint" role="note">
            {t("lastIdentityNote")}
          </p>
        ) : null}

        {linkable.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {linkable.map((provider) => {
              const unavailable = isProviderUnavailable(providers, provider);
              return (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  disabled={!!pending || unavailable}
                  onClick={() => link.mutate(provider)}
                >
                  {pending === provider ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  {t("linkProvider", { provider: PROVIDER_LABEL[provider] })}
                </Button>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
