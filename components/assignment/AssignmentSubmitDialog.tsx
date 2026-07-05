"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Pencil } from "lucide-react";

interface AssignmentSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  finalAnswer?: string;
  onEditFinalAnswer?: () => void;
}

const PREVIEW_LIMIT = 200;

export function AssignmentSubmitDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  finalAnswer = "",
  onEditFinalAnswer,
}: AssignmentSubmitDialogProps) {
  const t = useTranslations("assignment");
  const trimmed = finalAnswer.trim();
  const preview =
    trimmed.length > PREVIEW_LIMIT ? trimmed.slice(0, PREVIEW_LIMIT) + "…" : trimmed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t("submitDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("submitDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {trimmed && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("submitDialog.finalAnswerPreview")}</span>
              {onEditFinalAnswer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEditFinalAnswer}
                  disabled={isSubmitting}
                  className="h-7 px-2 gap-1 text-xs"
                >
                  <Pencil className="w-3 h-3" />
                  {t("submitDialog.editButton")}
                </Button>
              )}
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {preview}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("submitDialog.cancelButton")}
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t("submitDialog.submittingButton") : t("submitDialog.submitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
