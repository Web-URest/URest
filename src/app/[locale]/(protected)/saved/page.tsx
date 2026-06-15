import { getTranslations } from "next-intl/server";

export default async function SavedPage() {
  const t = await getTranslations("Nav");
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-12 md:px-6">
      <h1 className="font-display text-3xl text-ink-900">{t("saved")}</h1>
    </main>
  );
}
