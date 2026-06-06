"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { objectiveKeyToOptionValue } from "@/lib/objective-key-select";

interface UseObjectiveKeyboardSelectParams {
  /** True only when the current question is objective (MCQ/OX) AND a question id exists. */
  enabled: boolean;
  /** Question type string ("multiple-choice", "true-false", …) */
  type: string | undefined;
  /** Number of displayed options */
  optionCount: number;
  /** Shuffled display order from seededOptionOrder(); undefined → identity */
  displayOrder?: number[];
  /** Called with the ORIGINAL index string (e.g. "2") when a valid digit key is pressed. */
  onSelect: (value: string) => void;
  /** Called when Enter is pressed (same guards as digit keys). Advance to next question. */
  onNext?: () => void;
}

/**
 * Adds a document-level keydown listener that maps digit keys 1–N to the
 * corresponding displayed option on an objective question.
 *
 * The listener is only active when `enabled` is true, and ignores events when:
 *  - a modifier key (Ctrl / Meta / Alt) is held
 *  - the event is auto-repeated (key held down)
 *  - focus is in an editable element (input, textarea, select, contenteditable)
 *  - a modal dialog ([role="dialog"][data-state="open"]) is visible
 */
export function useObjectiveKeyboardSelect(
  params: UseObjectiveKeyboardSelectParams,
): void {
  // Keep a ref to latest params so the effect handler never goes stale
  // without needing to rebind on every render.  We sync in useLayoutEffect
  // (before paint) so it is never read during render itself.
  const paramsRef = useRef(params);
  useLayoutEffect(() => {
    paramsRef.current = params;
  });

  useEffect(() => {
    if (!params.enabled) return;

    const handler = (event: KeyboardEvent) => {
      const { enabled, type, optionCount, displayOrder, onSelect, onNext } =
        paramsRef.current;

      if (!enabled) return;

      // Let real shortcuts through
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Skip auto-repeat fires
      if (event.repeat) return;

      // Skip when focus is inside an editable element
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Skip when a modal dialog is open (Radix Dialog → role="dialog",
      // AlertDialog → role="alertdialog"; both set data-state="open")
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      )
        return;

      const value = objectiveKeyToOptionValue(event.key, {
        type: type ?? "",
        optionCount,
        displayOrder,
      });

      if (value !== null) {
        event.preventDefault();
        onSelect(value);
        return;
      }

      // Enter → advance to next question, but only when focus is NOT on an
      // interactive control. Otherwise let the browser run that control's
      // native Enter activation (이전/다음/나가기 buttons, option radios) — a
      // document-level preventDefault here would hijack their keyboard use.
      // (Scoped to the Enter branch so digit-key selection is unaffected.)
      if (event.key === "Enter") {
        if (
          target?.closest(
            'button, a, [role="radio"], [role="button"], [href], [tabindex]:not([tabindex="-1"])',
          )
        ) {
          return;
        }
        event.preventDefault();
        onNext?.();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [params.enabled]); // re-register only when enabled toggles; latest params read via ref
}
