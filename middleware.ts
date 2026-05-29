import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all public pages; exclude API, dashboard, console, passport, auth
  // helpers, design-system, onboarding, and static assets.
  matcher: [
    "/((?!api|_next|dashboard|console|passport|authenticate|logout|onboarding|design-system|.*\\..*).*)"
  ]
};
