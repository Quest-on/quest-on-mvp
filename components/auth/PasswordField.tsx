"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

/**
 * show/hide 토글이 달린 비밀번호 입력 필드.
 *
 * `components/settings/ChangePasswordForm.tsx` 안에 있던 것을 그대로 옮겼다.
 * 비밀번호 재설정 화면(#318)이 같은 필드를 쓰는데, 복사해 두면 토글 접근성
 * 속성 같은 게 한쪽에만 고쳐진다.
 *
 * 문구는 전부 prop 으로 받는다 — 이 컴포넌트는 next-intl 네임스페이스를 모른다.
 * 설정 화면과 재설정 화면이 서로 다른 네임스페이스를 쓰기 때문이다.
 */
export function PasswordField({
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
