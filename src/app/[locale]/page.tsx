import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-4xl text-ink-900">{t("title")}</h1>
      <p className="max-w-md text-ink-700">{t("subtitle")}</p>
      <span className="rounded-full bg-aqua-100 px-4 py-1 text-sm font-semibold text-teal-600">
        {t("status")}
      </span>
    </main>
  );
}
