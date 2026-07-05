"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ObjectiveAnswerVariant = "list" | "grid-2x2" | "row-1x2";

interface ObjectiveAnswerPanelProps {
  type: string;
  options?: string[];
  value: string;
  onChange: (value: string) => void;
  displayOrder?: number[];
  fullHeight?: boolean;
  variant?: ObjectiveAnswerVariant;
}

/**
 * 객관식/OX 문제의 학생 응시 위젯.
 * variant: list (MCQ, 세로 1열), row-1x2 (O/X), grid-2x2 (legacy).
 */
export function ObjectiveAnswerPanel({
  type,
  options,
  value,
  onChange,
  displayOrder,
  fullHeight = false,
  variant,
}: ObjectiveAnswerPanelProps) {
  const t = useTranslations("exam");
  const resolvedOptions =
    options && options.length > 0
      ? options
      : type === "true-false"
        ? ["O", "X"]
        : [];

  const order =
    type !== "true-false" &&
    displayOrder &&
    displayOrder.length === resolvedOptions.length
      ? displayOrder
      : resolvedOptions.map((_, index) => index);

  const selectedIndex = (() => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  })();

  const resolvedVariant: ObjectiveAnswerVariant =
    variant ??
    (type === "true-false" ? "row-1x2" : "list");

  const promptLabel =
    type === "true-false" ? t("objectivePanel.promptTrueFalse") : t("objectivePanel.promptMultiple");

  return (
    <div
      className={cn(
        "overflow-y-auto hide-scrollbar bg-muted/20",
        fullHeight && "h-full",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-3xl bg-background",
          fullHeight && "min-h-full",
        )}
      >
        <div className="space-y-4 p-4 sm:p-6 lg:p-8">
          <p className="text-sm font-semibold text-muted-foreground">{promptLabel}</p>

          {resolvedOptions.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {t("objectivePanel.noOptions")}
            </p>
          ) : resolvedVariant === "grid-2x2" ? (
            <OptionGrid
              order={order}
              options={resolvedOptions}
              selectedIndex={selectedIndex}
              onChange={onChange}
              showNumberBadge
            />
          ) : resolvedVariant === "row-1x2" ? (
            <OptionRow
              order={order}
              options={resolvedOptions}
              selectedIndex={selectedIndex}
              onChange={onChange}
            />
          ) : (
            <OptionList
              order={order}
              options={resolvedOptions}
              selectedIndex={selectedIndex}
              onChange={onChange}
            />
          )}

          <p className="text-xs text-muted-foreground">{t("objectivePanel.autoSaveNotice")}</p>
        </div>
      </div>
    </div>
  );
}

function OptionGrid({
  order,
  options,
  selectedIndex,
  onChange,
  showNumberBadge,
}: {
  order: number[];
  options: string[];
  selectedIndex: number | null;
  onChange: (value: string) => void;
  showNumberBadge: boolean;
}) {
  const t = useTranslations("exam");
  return (
    <ul className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("objectivePanel.optionsAriaLabel")}>
      {order.map((originalIndex, displayIndex) => (
        <li key={originalIndex}>
          <OptionButton
            originalIndex={originalIndex}
            displayIndex={displayIndex}
            label={options[originalIndex]}
            isSelected={selectedIndex === originalIndex}
            onSelect={() => onChange(String(originalIndex))}
            showNumberBadge={showNumberBadge}
            size="card"
          />
        </li>
      ))}
    </ul>
  );
}

function OptionRow({
  order,
  options,
  selectedIndex,
  onChange,
}: {
  order: number[];
  options: string[];
  selectedIndex: number | null;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("exam");
  return (
    <ul className="grid grid-cols-2 gap-4" role="radiogroup" aria-label={t("objectivePanel.optionsAriaLabel")}>
      {order.map((originalIndex) => (
        <li key={originalIndex}>
          <OptionButton
            originalIndex={originalIndex}
            displayIndex={originalIndex}
            label={options[originalIndex]}
            isSelected={selectedIndex === originalIndex}
            onSelect={() => onChange(String(originalIndex))}
            showNumberBadge={false}
            size="large"
          />
        </li>
      ))}
    </ul>
  );
}

function OptionList({
  order,
  options,
  selectedIndex,
  onChange,
}: {
  order: number[];
  options: string[];
  selectedIndex: number | null;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("exam");
  return (
    <ul className="space-y-2.5" role="radiogroup" aria-label={t("objectivePanel.optionsAriaLabel")}>
      {order.map((originalIndex, displayIndex) => (
        <li key={originalIndex}>
          <OptionButton
            originalIndex={originalIndex}
            displayIndex={displayIndex}
            label={options[originalIndex]}
            isSelected={selectedIndex === originalIndex}
            onSelect={() => onChange(String(originalIndex))}
            showNumberBadge
            size="list"
          />
        </li>
      ))}
    </ul>
  );
}

function OptionButton({
  originalIndex,
  displayIndex,
  label,
  isSelected,
  onSelect,
  showNumberBadge,
  size,
}: {
  originalIndex: number;
  displayIndex: number;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  showNumberBadge: boolean;
  size: "card" | "large" | "list";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      data-testid={`objective-option-${originalIndex}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        size === "large"
          ? "min-h-[88px] justify-center p-6 text-lg font-semibold sm:min-h-[100px] sm:text-xl"
          : size === "card"
            ? "min-h-[88px] flex-col justify-center p-4 text-center sm:min-h-[96px]"
            : "p-3 sm:p-4",
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/50",
      )}
    >
      {showNumberBadge && size !== "large" && (
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
            size === "card" ? "mb-1" : "",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 text-muted-foreground",
          )}
        >
          {displayIndex + 1}
        </span>
      )}
      <span
        className={cn(
          "flex-1",
          size === "card" ? "text-sm sm:text-base line-clamp-4" : "text-sm sm:text-base",
          size === "large" && "flex-none text-center",
        )}
      >
        {label}
      </span>
      {isSelected && size === "list" && (
        <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
      )}
    </button>
  );
}
