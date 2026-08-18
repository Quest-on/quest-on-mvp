"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Send } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface AssignmentHeaderProps {
  title: string;
  deadline: string | null;
  isSubmitted: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  onDeadlineExpired?: () => void;
}

export function AssignmentHeader({
  title,
  deadline,
  isSubmitted,
  onSubmit,
  isSubmitting,
  onDeadlineExpired,
}: AssignmentHeaderProps) {
  const t = useTranslations("assignment");
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState("");
  const [isOverdue, setIsOverdue] = useState(false);
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    if (!deadline) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setTimeLeft(t("header.overdue"));
        setIsOverdue(true);
        // Trigger auto-submit on deadline expiry (once)
        if (!expiredCalledRef.current && !isSubmitted && onDeadlineExpired) {
          expiredCalledRef.current = true;
          onDeadlineExpired();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(t("header.timeLeftDaysHours", { days, hours }));
      } else if (hours > 0) {
        setTimeLeft(t("header.timeLeftHoursMinutes", { hours, minutes }));
      } else if (minutes > 0) {
        setTimeLeft(t("header.timeLeftMinutesSeconds", { minutes, seconds }));
      } else {
        setTimeLeft(t("header.timeLeftSeconds", { seconds }));
      }
      setIsOverdue(false);
    };

    updateTimer();
    // Tick every second when < 5 minutes, every 60s otherwise
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - Date.now();
    const intervalMs = diff <= 5 * 60 * 1000 ? 1000 : 60000;
    const interval = setInterval(updateTimer, intervalMs);
    return () => clearInterval(interval);
  }, [deadline, isSubmitted, onDeadlineExpired]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-lg font-semibold truncate">{title}</h1>
        {isSubmitted && (
          <Badge variant="secondary" className="bg-success-solid text-foreground">
            {t("header.submittedBadge")}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {deadline && (
          <div className={`flex items-center gap-1.5 text-sm ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            <Clock className="w-4 h-4" />
            <span>{timeLeft}</span>
          </div>
        )}
        {!isSubmitted && (
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
            size="sm"
            className="gap-1.5"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? t("header.submittingButton") : t("header.submitButton")}
          </Button>
        )}
      </div>
    </div>
  );
}
