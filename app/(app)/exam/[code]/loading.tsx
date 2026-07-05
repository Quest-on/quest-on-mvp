import { getTranslations } from "next-intl/server";

export default async function ExamLoading() {
  const t = await getTranslations("auth.loading");
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t("exam")}</p>
      </div>
    </div>
  );
}
