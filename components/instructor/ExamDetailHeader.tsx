import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

interface ExamDetailHeaderProps {
  title: string;
  code: string;
  examId: string;
  extraActions?: ReactNode;
}

export async function ExamDetailHeader({
  title,
  code,
  examId,
  extraActions,
}: ExamDetailHeaderProps) {
  const t = await getTranslations("authoring");
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">
            {t("examDetailHeader.examCode", { code })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {extraActions}
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/instructor">
              <Button variant="outline" size="sm">
                <span className="sm:hidden">{t("examDetailHeader.buttonDashboardShort")}</span>
                <span className="hidden sm:inline">{t("examDetailHeader.buttonDashboardLong")}</span>
              </Button>
            </Link>
            <Link href={`/instructor/${examId}/edit`}>
              <Button size="sm">{t("examDetailHeader.buttonEdit")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
