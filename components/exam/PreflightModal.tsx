"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Clock, FileText, Shield, AlertTriangle, ChevronDown } from "lucide-react";

interface PreflightModalProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  examTitle?: string;
  examDuration?: number;
  examDescription?: string;
  examHasEssay: boolean;
}

export function PreflightModal({
  open,
  onAccept,
  onCancel,
  examTitle,
  examDuration,
  examDescription,
  examHasEssay,
}: PreflightModalProps) {
  const t = useTranslations("exam");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [aiLogAccepted, setAiLogAccepted] = useState(false);

  const handleAccept = () => {
    const canAccept = examHasEssay
      ? rulesAccepted && aiLogAccepted
      : rulesAccepted;
    if (canAccept) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            {t("preflight.title")}
          </DialogTitle>
          <DialogDescription>
            {t("preflight.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 핵심 요약 */}
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/20">
            <ul className="space-y-2 text-sm font-medium">
              <li className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{examDuration === 0 ? t("preflight.timePolicyUnlimited") : t("preflight.timePolicyAuto")}</span>
              </li>
              {examHasEssay && (
                <li className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("preflight.aiOnly")}</span>
                </li>
              )}
              {examHasEssay && (
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("preflight.aiLogged")}</span>
                </li>
              )}
            </ul>
          </div>

          {/* AI 사용 안내 (AC-14) — examHasEssay 와 무관하게 항상 노출한다.
              대학생 54%가 시험에서 AI 사용을 부정행위로 인식한다. 우리 제품은
              AI에게 묻는 것이 시험의 일부이고 질문 자체가 채점 대상인데,
              학생이 그걸 모르면 겁먹고 질문을 안 해 점수가 낮게 나온다.
              그래서 감시("기록됩니다") 프레임이 아니라 허용·투명성 프레임으로 쓴다. */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              {t("preflight.aiDisclosureTitle")}
            </h3>
            <ul className="space-y-1.5 text-sm">
              <li>{t("preflight.aiDisclosureAllowed")}</li>
              <li>{t("preflight.aiDisclosureGraded")}</li>
              <li>{t("preflight.aiDisclosureVisible")}</li>
            </ul>
          </div>

          {/* 시험 정보 */}
          {examTitle && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("preflight.examInfoTitle")}
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">{t("preflight.examName")}</span> {examTitle}
                </p>
                {examDuration != null && examDuration > 0 && (
                  <p>
                    <span className="font-medium">{t("preflight.examDuration")}</span> {t("preflight.examDurationValue", { duration: examDuration })}
                  </p>
                )}
                {examDuration === 0 && (
                  <p>
                    <span className="font-medium">{t("preflight.examDuration")}</span> {t("preflight.examDurationUnlimited")}
                  </p>
                )}
                {examDescription && (
                  <p>
                    <span className="font-medium">{t("preflight.examDescription")}</span> {examDescription}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 세부 규칙 (접을 수 있는 아코디언) */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full border rounded-lg p-4 hover:bg-muted/50 transition-colors text-left">
              <span className="font-semibold text-sm">{t("preflight.detailsToggle")}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-2">
              {/* 시간 정책 */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-primary" />
                  {t("preflight.timePolicySectionTitle")}
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {examDuration === 0 ? (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyUnlimitedBullet1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyUnlimitedBullet2")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyUnlimitedBullet3")}</span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyBullet1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyBullet2")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{t("preflight.timePolicyBullet3")}</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* 시험 규칙 */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  {t("preflight.rulesSectionTitle")}
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{t("preflight.rulesBullet1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{t("preflight.rulesBullet2")}</span>
                  </li>
                  {examHasEssay && (
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{t("preflight.rulesBullet3")}</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{t("preflight.rulesBullet4")}</span>
                  </li>
                </ul>
              </div>

              {/* AI 사용 정책 */}
              {examHasEssay && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    {t("preflight.aiPolicySectionTitle")}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                      <span className="text-blue-600 font-bold mt-0.5 text-sm">1</span>
                      <div>
                        <p className="font-semibold text-sm text-blue-700 dark:text-blue-400">{t("preflight.aiPolicyItem1Title")}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t("preflight.aiPolicyItem1Description")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <span className="text-red-600 font-bold mt-0.5 text-sm">2</span>
                      <div>
                        <p className="font-semibold text-sm text-red-700 dark:text-red-400">{t("preflight.aiPolicyItem2Title")}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t("preflight.aiPolicyItem2Description")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                      <span className="text-primary font-bold mt-0.5 text-sm">3</span>
                      <div>
                        <p className="font-semibold text-sm">{t("preflight.aiPolicyItem3Title")}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t("preflight.aiPolicyItem3Description")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* AI 로그 공지 */}
          {examHasEssay && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">{t("preflight.aiLogAlertTitle")}</p>
                  <p className="text-sm">
                    {t("preflight.aiLogAlertDescription")}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* 확인 체크박스 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="rules"
                data-testid="preflight-rules-checkbox"
                checked={rulesAccepted}
                onCheckedChange={(checked) =>
                  setRulesAccepted(checked === true)
                }
                className="mt-1"
              />
              <label
                htmlFor="rules"
                className="text-sm leading-relaxed cursor-pointer"
              >
                {t("preflight.rulesCheckLabel")}
              </label>
            </div>
            {examHasEssay && (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="ai-log"
                  data-testid="preflight-ailog-checkbox"
                  checked={aiLogAccepted}
                  onCheckedChange={(checked) =>
                    setAiLogAccepted(checked === true)
                  }
                  className="mt-1"
                />
                <label
                  htmlFor="ai-log"
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  {t("preflight.aiLogCheckLabel")}
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("preflight.cancelButton")}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={examHasEssay ? (!rulesAccepted || !aiLogAccepted) : !rulesAccepted}
            data-testid="preflight-accept-btn"
          >
            {t("preflight.acceptButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
