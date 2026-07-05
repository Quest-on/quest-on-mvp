"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { createSupabaseClient } from "@/lib/supabase-client";
import { Clock, Copy, Mail, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const CONTACT_EMAIL = "questonkr@gmail.com";

export default function InstructorPendingPage() {
  const t = useTranslations("auth.instructorPending");
  const { profile } = useAppUser();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
  };

  const emailSubject = encodeURIComponent(t("emailSubject"));
  const emailBody = encodeURIComponent(
    t("emailBody", { email: profile?.email || "" })
  );

  const mailtoLink = `mailto:${CONTACT_EMAIL}?subject=${emailSubject}&body=${emailBody}`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 아이콘 */}
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>

        {/* 제목 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("heading")}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("desc")}
          </p>
        </div>

        {/* 이메일 + 복사 */}
        <div className="bg-muted rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span>{t("contactEmailLabel")}</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-primary font-semibold text-lg">
              {CONTACT_EMAIL}
            </span>
            <button
              onClick={handleCopyEmail}
              className="p-1.5 rounded-md hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
              title={t("copyEmailTitle")}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
          {copied && (
            <p className="text-xs text-green-600">{t("copiedMsg")}</p>
          )}
        </div>

        {/* 문의하기 버튼 */}
        <a href={mailtoLink} className="block">
          <Button className="w-full h-12 gap-2">
            <Mail className="w-4 h-4" />
            {t("contactBtn")}
          </Button>
        </a>

        {/* 안내 */}
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-left space-y-1.5">
          <p className="font-medium text-foreground mb-2">{t("emailIncludeTitle")}</p>
          <p>{t("emailIncludeOrg")}</p>
          <p>{t("emailIncludeSubject")}</p>
          <p>{t("emailIncludePurpose")}</p>
        </div>

        {/* 승인 확인 버튼 */}
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="w-full"
        >
          {t("checkApprovalBtn")}
        </Button>

        {/* 로그아웃 */}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full text-muted-foreground gap-2"
        >
          <LogOut className="w-4 h-4" />
          {t("signOutBtn")}
        </Button>
      </div>
    </div>
  );
}
