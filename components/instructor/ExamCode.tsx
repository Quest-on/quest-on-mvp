"use client";

import { useTranslations } from "next-intl";
import { Copy, Check, ShieldAlert, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 시험 코드를 화면에 내보내는 **유일한** 컴포넌트 (이슈 #84).
 *
 * 왜 하나로 모으는가. 코드를 노출하는 표면이 네 곳이다 — 생성 성공 대화상자,
 * 드라이브 목록, 상세 헤더, 상세 카드. 표면마다 발행 한도 UI 를 따로 붙이면
 * 다음에 생기는 표면에서 반드시 잊힌다. `is_demo` 제외 필터에서 이미 똑같이
 * 겪었고, 그때는 deny-by-default 레지스트리로 막았다.
 *
 * 여기서 막지 못하면 벌어지는 일: 교수자가 네 번째 시험 코드를 수업 자료에
 * 배포한 뒤, 수업 중에 학생 30명이 전원 입장 거부를 당한다. 한도가 있다는
 * 사실을 **코드를 건네기 전에** 알아야 한다.
 *
 * 상시 숫자 카운터는 두지 않는다. 발행 카운트는 "만든 시험 수"가 아니라
 * "첫 학생이 들어온 시험 수"라 `1/3 사용` 같은 표시는 의미부터 틀리고, 첫
 * 경험을 제약 중심으로 만든다. 대신 단계별로:
 *   - 여유 있음  → 정책 한 줄
 *   - 임박       → 경고 + 잔여량
 *   - 도달       → **코드 반출 차단** + 인증 CTA
 *   - 데모       → 아무것도 안 보임 (데모는 한도를 소모하지 않는다)
 */
export type ExamCodeQuota = {
  /** 데모는 한도를 소모하지 않으므로 어떤 안내도 띄우지 않는다. */
  isDemo?: boolean;
  /** 이 시험이 이미 학생을 받았는가. 받았으면 발행 한도를 다시 적용하지 않는다. */
  alreadyPublished?: boolean;
  /** 남은 발행 횟수. `null` 이면 무제한. */
  publishesRemaining?: number | null;
};

type ExamCodeProps = {
  code: string;
  quota?: ExamCodeQuota;
  className?: string;
  /** 코드 옆 복사 버튼을 띄울지. 목록처럼 좁은 자리에서는 끈다. */
  copyable?: boolean;
};

/** 한도 상태를 하나의 값으로 정리한다. 표면마다 다르게 판단하면 안 된다. */
export function resolveCodeGate(quota?: ExamCodeQuota): "open" | "warning" | "blocked" {
  if (!quota) return "open";
  if (quota.isDemo) return "open";
  if (quota.alreadyPublished) return "open";
  if (quota.publishesRemaining === null || quota.publishesRemaining === undefined) return "open";
  if (quota.publishesRemaining <= 0) return "blocked";
  if (quota.publishesRemaining <= 1) return "warning";
  return "open";
}

export function ExamCode({ code, quota, className, copyable = true }: ExamCodeProps) {
  const t = useTranslations("authoring.examCode");
  const [copied, setCopied] = useState(false);
  const gate = resolveCodeGate(quota);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 차단 상태에서는 코드 자체를 내보내지 않는다. 보여주고 "쓰지 마세요"라고
  // 적는 건 소용이 없다 — 이미 복사해서 배포한 뒤다.
  if (gate === "blocked") {
    return (
      <div className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)}>
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">{t("blockedTitle")}</p>
            <p className="type-meta">{t("blockedBody")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <code className="font-mono text-base font-semibold tracking-wider">{code}</code>
        {copyable && (
          <Button variant="ghost" size="sm" onClick={copy} aria-label={t("copyAria")}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
      {gate === "warning" && (
        <p className="flex items-center gap-1.5 text-xs text-warning-solid dark:text-warning-solid">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("warning", { remaining: quota?.publishesRemaining ?? 0 })}
        </p>
      )}
    </div>
  );
}
