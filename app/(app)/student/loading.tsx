import { getTranslations } from "next-intl/server";
import { DashboardPageFallback } from "@/components/dashboard/DashboardPageFallback";

export default async function StudentLoading() {
  const t = await getTranslations("auth.loading");
  return (
    <DashboardPageFallback
      title={t("student")}
      description={t("studentDesc")}
    />
  );
}
