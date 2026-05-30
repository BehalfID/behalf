import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "de", "es", "fr"],
  defaultLocale: "en",
  localePrefix: "as-needed"
});
