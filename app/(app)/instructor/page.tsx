"use client";

import dynamic from "next/dynamic";
import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";
import { useTranslations } from "next-intl";

function InstructorPageFallback() {
  const t = useTranslations("instructor");
  return (
    <DashboardPageFallback
      title={t("home.loadingTitle")}
      description={t("home.loadingDesc")}
    />
  );
}

const InstructorHomeClient = dynamic(
  () => import("@/components/instructor/InstructorHomeClient"),
  {
    ssr: false,
    loading: () => <InstructorPageFallback />,
  }
);

export default function InstructorPage() {
  return <InstructorHomeClient />;
}
