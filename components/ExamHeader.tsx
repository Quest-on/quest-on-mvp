"use client";

import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExamTimer } from "@/components/exam/ExamTimer";
import { useTranslations } from "next-intl";

interface ExamHeaderProps {
  examCode: string;
  duration: number; // in minutes
  currentStep: "exam" | "answer";
  user?: {
    avatarUrl?: string | null;
    fullName?: string | null;
    email?: string;
  } | null;
  sessionStartTime?: string | null;
  timeRemaining?: number | null;
  onTimeExpired?: () => void;
  onExit?: () => void;
  disableLogoLink?: boolean;
}

/** Pre-exam / submitted screens: logo, timer, profile. In-exam uses ExamCenterToolbar instead. */
export function ExamHeader({
  duration,
  currentStep,
  user,
  sessionStartTime,
  timeRemaining,
  onTimeExpired,
  onExit,
  disableLogoLink = false,
}: ExamHeaderProps) {
  const t = useTranslations("common");

  return (
    <div className="bg-background/95 backdrop-blur-sm border-b flex-shrink-0">
      <div className="container mx-auto px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 justify-start">
            <Image
              src="/qlogo_icon.png"
              alt={t("brand.name")}
              width={120}
              height={32}
              className={`h-8 w-auto ${disableLogoLink ? "pointer-events-none opacity-70" : ""}`}
            />
            <ExamTimer
              duration={duration}
              sessionStartTime={sessionStartTime}
              timeRemaining={timeRemaining}
              onTimeExpired={onTimeExpired}
            />
          </div>

          <div className="flex items-center justify-end space-x-3">
            {currentStep === "exam" && onExit && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExit}
                className="text-sm border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                {t("exam.quit")}
              </Button>
            )}
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={user?.avatarUrl ?? undefined}
                alt={user?.fullName || "User"}
              />
              <AvatarFallback>
                {user?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </div>
  );
}
