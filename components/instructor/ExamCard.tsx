"use client";

import { Button } from "@/components/ui/button";
import { ExamCode, type ExamCodeQuota } from "@/components/instructor/ExamCode";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Copy, Clock, Calendar, Eye, Edit, Trash2, Users } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate as fmtDate } from "@/lib/i18n/format";

interface ExamCardProps {
  /** 발행 한도 상태. 없으면 게이트가 열린 것으로 본다(fail-open). */
  quota?: ExamCodeQuota;
  exam: {
    id: string;
    title: string;
    code: string;
    is_demo?: boolean;
    first_published_at?: string | null;
    status: string;
    duration: number;
    created_at: string;
    student_count?: number;
  };
  variant?: "compact" | "expanded";
  onCopyCode?: (code: string) => void;
  onEdit?: (examId: string) => void;
  onDelete?: (examId: string) => void;
  showStudentCount?: boolean;
}

export function ExamCard({
  quota,
  exam,
  onCopyCode,
  onEdit,
  onDelete,
  showStudentCount = true,
}: ExamCardProps) {
  const t = useTranslations("authoring");
  const locale = useLocale() as "ko" | "en";
  const getStatusBadgeProps = (status: string) => {
    if (status === "published") {
      return {
        variant: "default" as const,
        className: "text-xs",
        text: t("examCard.statusPublished"),
      };
    }
    return {
      variant: "secondary" as const,
      className: "text-xs",
      text: status === "draft" ? t("examCard.statusDraft") : status,
    };
  };

  const formatDate = (dateString: string) => {
    return fmtDate(dateString, locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const badgeProps = getStatusBadgeProps(exam.status);
  const iconSize = "w-3 h-3";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h4 className="font-semibold text-foreground truncate">{exam.title}</h4>
          <Badge variant={badgeProps.variant} className={`${badgeProps.className} shrink-0`}>
            {badgeProps.text}
          </Badge>
        </div>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {/* 코드는 ExamCode 만 내보낸다. 목록에서 직접 그리면 발행 한도
              게이트를 우회하게 되고, 교수자가 배포한 뒤 학생이 튕긴다. */}
          <ExamCode
            code={exam.code}
            copyable={false}
            quota={{
              isDemo: exam.is_demo,
              alreadyPublished: !!exam.first_published_at,
              publishesRemaining: quota?.publishesRemaining ?? null,
            }}
          />
          <div className="flex items-center space-x-1">
            <Clock className={iconSize} />
            <span>{t("examCard.durationMin", { duration: exam.duration })}</span>
          </div>
          {showStudentCount && (
            <div className="flex items-center space-x-1">
              <Users className={iconSize} />
              <span>{t("examCard.studentCount", { count: exam.student_count || 0 })}</span>
            </div>
          )}
          <div className="flex items-center space-x-1">
            <Calendar className={iconSize} />
            <span>{formatDate(exam.created_at)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
        {onCopyCode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopyCode(exam.code)}
          >
            <Copy className={`${iconSize} sm:mr-1`} />
            <span className="hidden sm:inline">{t("examCard.buttonCopy")}</span>
          </Button>
        )}
        <Link href={`/instructor/${exam.id}`}>
          <Button variant="outline" size="sm">
            <Eye className={`${iconSize} sm:mr-1`} />
            <span className="hidden sm:inline">{t("examCard.buttonView")}</span>
          </Button>
        </Link>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={() => onEdit(exam.id)}>
            <Edit className={`${iconSize} sm:mr-1`} />
            <span className="hidden sm:inline">{t("examCard.buttonEdit")}</span>
          </Button>
        )}
        {onDelete && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive/80"
            onClick={() => onDelete(exam.id)}
          >
            <Trash2 className={`${iconSize} sm:mr-1`} />
            <span className="hidden sm:inline">{t("examCard.buttonDelete")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
