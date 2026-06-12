import { defineRouting } from "next-intl/routing";

// ADR-008: Thai is the default and source locale — unprefixed URLs.
// English lives under /en.
export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "as-needed",
});
