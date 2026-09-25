import { notFound } from "next/navigation";
import { isPasswordResetEnabled } from "@/lib/password-reset-availability";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function Page() {
  // 재설정은 닫혀 있다 (#318). lib/password-reset-availability.ts 참조.
  if (!isPasswordResetEnabled()) notFound();
  return <ResetPasswordForm />;
}
