import { getTranslations } from "next-intl/server";
import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";

export default async function InstructorLoading() {
  const t = await getTranslations("auth.loading");
  return (
    <DashboardPageFallback
      title={t("instructor")}
      description={t("instructorDesc")}
    />
  );
}
