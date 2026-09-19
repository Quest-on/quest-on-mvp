"use client";

import { useTranslations } from "next-intl";
import { Copy, Check, ShieldAlert, AlertTriangle, Mail, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supportMailto } from "@/lib/contact";

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
 *   - 여유 있음  → 정책 한 줄  (※ 아직 비어 있다. 이슈 #395)
 *   - 임박       → 경고 + 잔여량
 *   - 도달       → **코드 반출 차단** + 인증 CTA
 *   - 데모       → 아무것도 안 보임 (데모는 한도를 소모하지 않는다)
 */
/**
 * `/api/instructor/quota` 응답.
 *
 * 네 화면이 각자 인라인으로 선언하고 있었다 - 한 곳에 필드를 더해도
 * 나머지가 모르면 게이트가 판정할 값을 못 받는다.
 */
export type InstructorQuotaResponse = {
  publishesRemaining: number | null;
  /**
   * 플랜의 발행 **상한**. `null` 이면 무제한.
   *
   * 잔여(publishesRemaining)와 따로 내보내는 이유: 화면이 "시험 3개까지"를
   * 말하려면 상한이 필요한데, 그 숫자를 메시지에 박으면 `plan_limits` 와
   * 갈라진다. 그 테이블은 사고 시 UPDATE 한 줄로 한도를 푸는 복구 수단이라,
   * 갈라지는 순간 화면이 거짓말을 한다.
   */
  maxPublishes: number | null;
  /**
   * 플랜의 시험당 학생 **상한**. `null` 이면 무제한.
   *
   * 예전 이름이 `studentsRemaining` 이었는데, 담긴 값은 잔여가 아니라 상한이다.
   * 그 이름을 그대로 믿은 표면이 실제로 있었다(`ExamCard`) — 5명을 이미 받은
   * 시험을 "5자리 남음"으로 판정했다. 잔여는 이 상한에서 그 시험의 실제 학생
   * 수를 뺀 값이고, 그 계산은 `resolveStudentsRemaining` 한 곳에서만 한다.
   */
  maxStudents: number | null;
  plan?: string | null;
};

export type ExamCodeQuota = {
  /** 데모는 한도를 소모하지 않으므로 어떤 안내도 띄우지 않는다. */
  isDemo?: boolean;
  /** 이 시험이 이미 학생을 받았는가. 받았으면 발행 한도를 다시 적용하지 않는다. */
  alreadyPublished?: boolean;
  /** 남은 발행 횟수. `null` 이면 무제한. */
  publishesRemaining?: number | null;
  /**
   * **이 시험이** 더 받을 수 있는 학생 수. `null` 이면 무제한.
   *
   * 플랜 상한이 아니라 잔여다. `resolveStudentsRemaining` 으로 계산해서 넣는다.
   *
   * 발행 한도와 별개다 — 발행에 여유가 있어도 이 시험의 학생 자리가 차면
   * 새 학생은 못 들어온다(`admit_exam_session` 의 student_limit).
   */
  studentsRemaining?: number | null;
  /**
   * 안내용 플랜 **상한** 두 축. `null` 이면 무제한.
   *
   * 게이트 판정에는 쓰지 않는다 — 판정은 잔여로만 한다. 이 둘은 "여유 있음"
   * 상태에서 뜨는 안내 팝오버의 값이다. 둘 중 하나라도 모르면 안내를 띄우지
   * 않는다. 인증을 마친 계정은 둘 다 `null` 이므로 자연히 아무것도 안 뜬다.
   */
  maxPublishes?: number | null;
  maxStudents?: number | null;
};

/** 무엇이 게이트를 닫았는가. 문구가 이 값을 따라간다. */
export type CodeGateReason = "publish" | "student";

export type CodeGate =
  | { level: "open"; reason: null }
  | { level: "warning" | "blocked"; reason: CodeGateReason };

const OPEN: CodeGate = { level: "open", reason: null };

/** 심각도 비교용. 숫자가 클수록 급하다. */
const SEVERITY = { open: 0, warning: 1, blocked: 2 } as const;

type Level = keyof typeof SEVERITY;

/**
 * 플랜 상한과 실제 학생 수로 **이 시험의** 잔여 자리를 낸다.
 *
 * 상한을 그대로 잔여로 쓰면 이미 5명을 받은 시험도 "5자리 남음"이 된다.
 * 뺄셈을 호출부마다 다시 쓰면 언젠가 한 곳이 빠뜨리므로 여기 한 번만 둔다.
 * 상한을 모르면(`null`) 잔여도 모른다 — 모르는 값은 막지 않는다.
 */
export function resolveStudentsRemaining(
  maxStudents: number | null | undefined,
  studentCount: number | null | undefined
): number | null {
  if (maxStudents === null || maxStudents === undefined) return null;
  return Math.max(0, maxStudents - (studentCount ?? 0));
}

/**
 * 코드를 내보내도 되는지, 그리고 **무엇 때문인지** 판정한다.
 *
 * 두 한도를 다 본다. 예전에는 발행 한도만 봐서, 학생 자리가 꽉 찬 시험의
 * 코드를 그대로 내보냈다 — 교수자는 다 뿌린 뒤에야 학생들이 못 들어온다는
 * 걸 알았고, 코드는 회수할 수 없다.
 *
 * 원인을 함께 돌려주는 이유(이슈 #393): 예전에는 심각도만 돌려줘서 호출부가
 * 원인을 복원할 수 없었고, 그래서 렌더가 원인과 무관하게 항상 발행 한도
 * 문구를 썼다. 학생 자리가 2개 남은 **쓸 수 있는** 코드 옆에 "앞으로 0개
 * 시험까지 학생을 받을 수 있습니다"가 떴다.
 *
 * 모르는 값(`null`/`undefined`)은 막지 않는다. 조회 실패와 "자리 없음" 은
 * 다르고, 최종 강제는 어차피 DB 함수가 한다.
 */
export function resolveCodeGate(quota?: ExamCodeQuota): CodeGate {
  if (!quota) return OPEN;
  // 데모는 어느 한도도 소모하지 않는다.
  if (quota.isDemo) return OPEN;

  const students = quota.studentsRemaining;
  const studentLevel: Level =
    students === null || students === undefined
      ? "open"
      : students <= 0
        ? "blocked"
        : students <= 3
          ? "warning"
          : "open";

  // 이미 발행한 시험은 발행 한도를 다시 적용하지 않는다
  // (`first_published_at IS NOT NULL`). 학생 한도는 계속 적용된다.
  const publishes = quota.publishesRemaining;
  const publishLevel: Level =
    quota.alreadyPublished || publishes === null || publishes === undefined
      ? "open"
      : publishes <= 0
        ? "blocked"
        : publishes <= 1
          ? "warning"
          : "open";

  // 더 심각한 쪽이 이긴다. 심각도가 같으면 학생 자리가 이긴다 — 코드를
  // 건네려는 시점에 급한 건 이 시험의 자리이고, 발행 한도는 다음 시험의
  // 문제다.
  if (SEVERITY[studentLevel] >= SEVERITY[publishLevel]) {
    return studentLevel === "open" ? OPEN : { level: studentLevel, reason: "student" };
  }
  return publishLevel === "open" ? OPEN : { level: publishLevel, reason: "publish" };
}

type ExamCodeProps = {
  code: string;
  quota?: ExamCodeQuota;
  className?: string;
  /** 코드 옆 복사 버튼을 띄울지. 목록처럼 좁은 자리에서는 끈다. */
  copyable?: boolean;
};

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
  if (gate.level === "blocked") {
    return (
      <div className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)}>
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">{t("blockedTitle")}</p>
            {/* 막은 이유를 그대로 말한다. 학생 자리가 찼는데 "발행 한도에
                도달했다"고 적으면, 발행에 여유가 있는 교수자가 엉뚱한 곳을
                본다. */}
            <p className="type-meta">
              {gate.reason === "student" ? t("blockedBodyStudent") : t("blockedBodyPublish")}
            </p>
            {/* 막았으면 나갈 길을 같은 화면에 둔다. "계정을 인증하세요" 는 상태
                서술이지 방법이 아니었다 — 어디서 어떻게 인증하는지 어느 화면에도 없었다. */}
            <a
              href={supportMailto(t("blockedMailSubject"))}
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive underline underline-offset-2"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {t("blockedCta")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 여유 있을 때의 안내는 문장이 아니라 아이콘 뒤에 둔다 (이슈 #395).
  //
  // ExamCode 는 코드가 보이는 자리마다 렌더되므로, 여기에 정책 문장을 상시로
  // 깔면 시험을 여러 개 굴리는 교수자에게는 같은 줄이 화면마다 반복된다.
  // 아이콘 하나면 자리를 거의 안 먹고, 필요한 사람만 열어 본다.
  //
  // 상한을 모르면 띄우지 않는다. 인증을 마친 계정은 두 상한이 모두 null 이라
  // 이 조건에서 자연히 빠진다 — plan 을 따로 볼 필요가 없다.
  const showLimits =
    !quota?.isDemo &&
    quota?.maxPublishes !== null &&
    quota?.maxPublishes !== undefined &&
    quota?.maxStudents !== null &&
    quota?.maxStudents !== undefined;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <code className="font-mono text-base font-semibold tracking-wider">{code}</code>
        {copyable && (
          <Button variant="ghost" size="sm" onClick={copy} aria-label={t("copyAria")}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
        {showLimits && gate.level === "open" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                aria-label={t("limitAria")}
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t("limitExamsLabel")}</dt>
                <dd className="text-right font-medium tabular-nums">
                  {t("limitExamsValue", { count: quota?.maxPublishes ?? 0 })}
                </dd>
                <dt className="text-muted-foreground">{t("limitStudentsLabel")}</dt>
                <dd className="text-right font-medium tabular-nums">
                  {t("limitStudentsValue", { count: quota?.maxStudents ?? 0 })}
                </dd>
              </dl>
              {/* 발행 카운트가 "만든 시험 수"가 아니라 "첫 학생이 들어온 시험
                  수"라는 건 직관과 어긋난다. 반직관적 산정 규칙은 숫자 바로
                  옆에 적는다. */}
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {t("limitNote")}
              </p>
              <a
                href={supportMailto(t("blockedMailSubject"))}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2"
              >
                <Mail className="h-3 w-3 shrink-0" />
                {t("blockedCta")}
              </a>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {gate.level === "warning" && (
        <p className="flex items-center gap-1.5 text-xs text-warning-solid dark:text-warning-solid">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {/* 원인이 말하는 숫자가 다르다. 학생 자리 경고에 발행 잔여를 끼워
              넣으면 "0개 남음" 옆에 멀쩡히 쓸 수 있는 코드가 놓인다. */}
          {gate.reason === "student"
            ? t("warningStudent", { remaining: quota?.studentsRemaining ?? 0 })
            : t("warningPublish", { remaining: quota?.publishesRemaining ?? 0 })}
        </p>
      )}
    </div>
  );
}
