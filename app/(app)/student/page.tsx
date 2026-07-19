"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";

function StudentPageFallback() {
  const t = useTranslations("student");
  return (
    <DashboardPageFallback
      title={t("page.loading.title")}
      description={t("page.loading.description")}
    />
  );
}

const StudentDashboardClient = dynamic(
  () => import("@/components/student/StudentDashboardClient"),
  {
    ssr: false,
    loading: () => <StudentPageFallback />,
  }
);

export default function StudentPage() {
  return <StudentDashboardClient />;
}
