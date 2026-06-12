import type { Metadata } from "next";
import { Anuphan, Chonburi } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import "../globals.css";

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-anuphan",
  display: "swap",
});

const chonburi = Chonburi({
  subsets: ["thai", "latin"],
  weight: "400",
  variable: "--font-chonburi",
  display: "swap",
});

export const metadata: Metadata = {
  title: "U-Rest — จองพูลวิลล่าโดยไม่ต้องเสี่ยงโดนโกง",
  description:
    "ทุกที่พักผ่านการตรวจสอบ เงินถึงเจ้าของหลังเช็คอินเท่านั้น — escrow-protected pool villa booking",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={locale}>
      <body className={`${anuphan.variable} ${chonburi.variable} antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
