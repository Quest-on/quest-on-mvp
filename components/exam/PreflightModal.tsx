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
  /** 이 학생이 아직 AI 사용 고지를 확인하지 않았는가 (AC-15) */
  showAiDisclosure?: boolean;
}

export function PreflightModal({
  open,
  onAccept,
  onCancel,
  examTitle,
  examDuration,
  examDescription,
  examHasEssay,
  showAiDisclosure = true,
}: PreflightModalProps) {
  const t = useTranslations("exam");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [aiLogAccepted, setAiLogAccepted] = useState(false);

  /**
   * AI 최초 고지 묶음을 이번 응시에 보여줄 것인가 (AC-14 / AC-15).
   *
   * `showAiDisclosure` — 이미 확인한 학생에게 매 시험 같은 걸 다시 읽히면 그때부터
   * 안 읽는다. AC-15 가 재노출을 금지하는 이유다.
   *
   * 3줄 블록만 숨기고 동의 체크박스를 남기면 "확인을 다시 받는" 것이라 재노출
   * 금지가 반쪽이 된다. 최초 확인 묶음(3줄 + 로그 공지 + 동의 체크박스 + 수락
   * 조건)을 하나의 게이트로 묶는다. 시험 규칙·시간 정책은 시험마다 다르므로
   * 이 게이트 밖에 그대로 둔다.
   */
  const showFirstRunAiConsent = showAiDisclosure;

  const handleAccept = () => {
    const canAccept = showFirstRunAiConsent
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
              {/* 최초 고지 묶음이 뜼는 회차에는 이 줄을 뺀다.

                  "기록된다" 를 여기서 한 번, 아래 AI 사용 안내에서 한 번,
                  확인 체크박스에서 또 한 번 말하면 세 번째부터는 아무도 안 읽는다.
                  고지를 반복해서 강하게 만들 수는 없고, 반복은 희석시킨다.
                  재응시(고지 묶음을 이미 본 학생)에는 이 줄이 유일한 안내이므로 남긴다. */}
              {examHasEssay && !showFirstRunAiConsent && (
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("preflight.aiLogged")}</span>
                </li>
              )}
            </ul>
          </div>

          {/* AI 사용 안내 (AC-14).
              대학생 54%가 시험에서 AI 사용을 부정행위로 인식한다. 우리 제품은
              AI에게 묻는 것이 시험의 일부이고 질문 자체가 채점 대상인데,
              학생이 그걸 모르면 겁먹고 질문을 안 해 점수가 낮게 나온다.
              그래서 감시("기록됩니다") 프레임이 아니라 허용, 투명성 프레임으로 쓴다.

              MCQ/OX 전용 시험은 채팅 권유 대신 외부 AI 금지와 기록 범위를
              안내한다. 시험 유형과 무관하게 최초 확인을 받아야 다음 시험에서
              고지를 건너뛰는 일이 없다.

              showAiDisclosure 는 사람 단위 최초 1회 게이팅이다 (AC-15). 이미 확인한
              학생에게 매 시험 같은 3줄을 다시 읽히면 그때부터는 안 읽는다. 확인
              사실은 onboarding_events(student_disclosure_ack)에 남는다. */}
          {showFirstRunAiConsent && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {t("preflight.aiDisclosureTitle")}
              </h3>
              <ul className="space-y-1.5 text-sm">
                {examHasEssay ? (
                  <>
                    <li>{t("preflight.aiDisclosureAllowed")}</li>
                    <li>{t("preflight.aiDisclosureGraded")}</li>
                    <li>{t("preflight.aiDisclosureVisible")}</li>
                  </>
                ) : (
                  <>
                    <li>{t("preflight.aiDisclosureUnavailable")}</li>
                    <li>{t("preflight.aiDisclosureExternalAiProhibited")}</li>
                    <li>{t("preflight.aiDisclosureActivityRecorded")}</li>
                  </>
                )}
              </ul>
            </div>
          )}

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
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-info-surface border border-info-border">
                      <span className="text-info-text font-bold mt-0.5 text-sm">1</span>
                      <div>
                        <p className="font-semibold text-sm text-info-text">{t("preflight.aiPolicyItem1Title")}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t("preflight.aiPolicyItem1Description")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                      <span className="text-destructive font-bold mt-0.5 text-sm">2</span>
                      <div>
                        <p className="font-semibold text-sm text-destructive">{t("preflight.aiPolicyItem2Title")}</p>
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

          {/* 확인 체크박스.

              여기에 있던 "AI 로그 공지" Alert 은 걷었다. 바로 아래 체크박스가
              같은 사실을 말하고 거기서 명시적 확인까지 받는다. 같은 문장을 두 번
              연속으로 놓으면 확인이 의례가 된다. */}
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
            {showFirstRunAiConsent && (
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
                  {t(examHasEssay ? "preflight.aiLogCheckLabel" : "preflight.aiActivityCheckLabel")}
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
            disabled={showFirstRunAiConsent ? (!rulesAccepted || !aiLogAccepted) : !rulesAccepted}
            data-testid="preflight-accept-btn"
          >
            {t("preflight.acceptButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
