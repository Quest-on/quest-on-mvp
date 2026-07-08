"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { createSupabaseClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const MIN_PASSWORD_LENGTH = 8;

/** show/hide 토글이 달린 비밀번호 입력 필드 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  toggleAriaLabel,
  autoComplete,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  toggleAriaLabel: string;
  autoComplete: string;
  placeholder: string;
  error?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          aria-label={toggleAriaLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("auth.changePassword");
  const { user } = useAppUser();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 이메일/비밀번호 로그인 수단 보유 여부 — 없으면 소셜 전용 계정이므로 "설정" 모드(재인증 생략)
  const hasPassword = (() => {
    const identities = user?.identities ?? [];
    if (identities.some((i) => i.provider === "email")) return true;
    const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
    return providers.includes("email");
  })();

  const email = user?.email ?? "";
  const confirmMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const validate = (): string | null => {
    if (hasPassword && !currentPassword) return t("currentPasswordRequired");
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return t("newPasswordTooShort", { minLength: MIN_PASSWORD_LENGTH });
    if (newPassword !== confirmPassword)
      return t("passwordMismatch");
    if (hasPassword && currentPassword === newPassword)
      return t("sameAsCurrentPassword");
    return null;
  };

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setRevokeOthers(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!email) {
      toast.error(t("noEmail"));
      return;
    }

    setIsSubmitting(true);
    const supabase = createSupabaseClient();
    try {
      // 1) 재인증 — 비밀번호 보유 계정만(소셜 전용은 설정 모드라 생략).
      //    현재 세션 사용자와 동일하므로 signInWithPassword 재호출은 세션을 갱신할 뿐이다.
      if (hasPassword) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (reauthError) {
          toast.error(t("wrongCurrentPassword"));
          setIsSubmitting(false);
          return;
        }
      }

      // 2) 비밀번호 변경/설정. 길이·유출 차단 등 정책은 Supabase가 서버단에서 강제한다.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        toast.error(updateError.message || t("updateFailed"));
        setIsSubmitting(false);
        return;
      }

      // 3) (옵션) 다른 기기 로그아웃 — 현재 세션은 유지하고 나머지 refresh token만 무효화.
      if (revokeOthers) {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "others",
        });
        if (signOutError) {
          toast.success(t("changedWithSignOutFail"));
          resetForm();
          setIsSubmitting(false);
          return;
        }
      }

      toast.success(
        hasPassword ? t("changed") : t("set"),
      );
      resetForm();
    } catch {
      toast.error(t("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {!hasPassword && (
        <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">
          {t("socialAccountInfo")}
        </p>
      )}

      {/* 소셜 전용 계정은 현재 비밀번호가 없으므로 입력 칸을 숨긴다 */}
      {hasPassword && (
        <PasswordField
          id="current-password"
          label={t("currentPasswordLabel")}
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((v) => !v)}
          toggleAriaLabel={showCurrent ? t("hidePassword") : t("showPassword")}
          autoComplete="current-password"
          placeholder={t("currentPasswordPlaceholder")}
        />
      )}

      <PasswordField
        id="new-password"
        label={hasPassword ? t("newPasswordLabel") : t("passwordLabel")}
        value={newPassword}
        onChange={setNewPassword}
        show={showNew}
        onToggleShow={() => setShowNew((v) => !v)}
        toggleAriaLabel={showNew ? t("hidePassword") : t("showPassword")}
        autoComplete="new-password"
        placeholder={t("newPasswordPlaceholder", { minLength: MIN_PASSWORD_LENGTH })}
      />

      <PasswordField
        id="confirm-password"
        label={t("confirmPasswordLabel")}
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showNew}
        onToggleShow={() => setShowNew((v) => !v)}
        toggleAriaLabel={showNew ? t("hidePassword") : t("showPassword")}
        autoComplete="new-password"
        placeholder={t("confirmPasswordPlaceholder")}
        error={confirmMismatch ? t("confirmMismatch") : null}
      />

      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id="revoke-others"
          checked={revokeOthers}
          onCheckedChange={(checked) => setRevokeOthers(checked === true)}
        />
        <Label htmlFor="revoke-others" className="text-sm font-normal cursor-pointer">
          {t("revokeOthersLabel")}
        </Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="min-h-[40px]">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : hasPassword ? (
          t("changeBtn")
        ) : (
          t("setBtn")
        )}
      </Button>
    </form>
  );
}
