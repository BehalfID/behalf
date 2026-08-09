/**
 * Regression for three production defects that turned out to share one cause.
 *
 * `ContinueWithPasskey` derived WebAuthn support during render, so the server
 * emitted a disabled button plus a "not supported" paragraph that the client's
 * first render omits. That structural hydration mismatch made React regenerate
 * the tree (minified error #418); because <html> is a React 19 Host Singleton,
 * the regeneration rebuilt its attribute set from props and dropped the
 * `data-theme` / `dark` that the pre-paint bootstrap had set — leaving the auth
 * page painting the light `.ds` register inside a dark document.
 *
 * The consent-ping CSP failure is unrelated in cause but shares the surface:
 * `/api/consent-ping` was auth-owned, so the proxy answered it with a
 * cross-host 308 that `connect-src 'self'` then blocked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

/** Strip comments so prose about a bug cannot satisfy a source guard. */
function code(path: string) {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));
// `@/proxy` is imported for buildCsp only; these are the same stand-ins the
// other proxy suites use so Next's middleware entrypoints resolve under node.
vi.mock("next/server", () => ({
  NextResponse: { next: vi.fn(), redirect: vi.fn(), rewrite: vi.fn() }
}));
vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));
// The design-system barrel pulls in next-intl's client navigation, which does
// not resolve under the node test environment. Only <Button> is needed here.
vi.mock("@/components/ui", () => ({
  Button: (props: Record<string, unknown>) => createElement("button", props)
}));

// ---------------------------------------------------------------------------
// 1. Hydration: server markup and the client's first render must agree.
// ---------------------------------------------------------------------------

describe("ContinueWithPasskey hydration stability", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  async function renderPasskey(enabled = true) {
    const { ContinueWithPasskey } = await import("@/components/auth/ContinueWithPasskey");
    // renderToStaticMarkup does not run effects, so this is exactly the output
    // React produces on the server *and* on the client's first pass.
    return renderToStaticMarkup(createElement(ContinueWithPasskey, { enabled }));
  }

  it("does not ship a server-only 'not supported' paragraph", async () => {
    const html = await renderPasskey();
    expect(html).toContain("Sign in with a passkey");
    expect(html).not.toContain("Passkeys are not supported in this browser.");
  });

  it("does not ship a server-only disabled attribute", async () => {
    const html = await renderPasskey();
    expect(html).not.toContain("disabled");
  });

  it("renders identically with and without a WebAuthn-capable window", async () => {
    const withoutWindow = await renderPasskey();

    // Simulate the browser the client actually hydrates in.
    (globalThis as { window?: unknown }).window = { PublicKeyCredential: function () {} };
    vi.resetModules();
    const withWindow = await renderPasskey();

    // Byte equality is the whole point: any difference is a hydration mismatch.
    expect(withWindow).toBe(withoutWindow);
  });

  it("renders nothing when the deployment has passkeys disabled", async () => {
    expect(await renderPasskey(false)).toBe("");
  });

  it("reads capability through a store with a server snapshot, not during render", () => {
    const file = code("components/auth/ContinueWithPasskey.tsx");
    expect(file).toContain("useSyncExternalStore");
    // A server snapshot is what keeps SSR and the hydration render identical.
    expect(file).toContain("assumeAvailableOnServer");
    // No bare render-time capability constant feeding the JSX any more.
    expect(file).not.toMatch(/const\s+browserSupported\s*=/);
    expect(file).not.toMatch(/typeof\s+window[\s\S]{0,80}\?\s*/);
  });

  it("still guards the ceremony itself at click time", () => {
    const file = code("components/auth/ContinueWithPasskey.tsx");
    expect(file).toMatch(/if\s*\(!isWebAuthnAvailable\(\)\)/);
  });
});

// ---------------------------------------------------------------------------
// 2. One theme contract, one writer.
// ---------------------------------------------------------------------------

type FakeDom = {
  attributes: Record<string, string>;
  classes: Set<string>;
  store: Map<string, string>;
  events: string[];
  listeners: Record<string, Array<() => void>>;
};

function installFakeDom(prefersDark: boolean): FakeDom {
  const dom: FakeDom = {
    attributes: {},
    classes: new Set(),
    store: new Map(),
    events: [],
    listeners: {}
  };

  const documentElement = {
    setAttribute: (name: string, value: string) => {
      dom.attributes[name] = value;
    },
    getAttribute: (name: string) => dom.attributes[name] ?? null,
    classList: {
      toggle: (name: string, on: boolean) => {
        if (on) dom.classes.add(name);
        else dom.classes.delete(name);
      },
      contains: (name: string) => dom.classes.has(name)
    }
  };

  const mediaListeners: Array<() => void> = [];
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement };
  g.localStorage = {
    getItem: (k: string) => dom.store.get(k) ?? null,
    setItem: (k: string, v: string) => void dom.store.set(k, v),
    removeItem: (k: string) => void dom.store.delete(k)
  };
  g.window = {
    matchMedia: () => ({
      matches: prefersDark,
      addEventListener: (_: string, fn: () => void) => mediaListeners.push(fn),
      removeEventListener: () => {}
    }),
    addEventListener: (type: string, fn: () => void) => {
      (dom.listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      dom.listeners[type] = (dom.listeners[type] ?? []).filter((f) => f !== fn);
    },
    dispatchEvent: (event: { type: string }) => {
      dom.events.push(event.type);
      for (const fn of dom.listeners[event.type] ?? []) fn();
      return true;
    }
  };
  // `Event` is a Node built-in — never replace or delete it, or every later
  // import of next/server in this file fails with "Event is not defined".
  dom.listeners.__media = mediaListeners;
  return dom;
}

function clearFakeDom() {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.window;
  delete g.localStorage;
}

describe("theme contract", () => {
  afterEach(() => {
    clearFakeDom();
    vi.resetModules();
  });

  async function theme() {
    return import("@/lib/theme");
  }

  it("applies the dark register when the stored preference is dark", async () => {
    const dom = installFakeDom(false);
    dom.store.set("theme", "dark");
    const { syncThemeFromPreference } = await theme();

    expect(syncThemeFromPreference()).toEqual({ preference: "dark", theme: "dark" });
    expect(dom.attributes["data-theme"]).toBe("dark");
    expect(dom.classes.has("dark")).toBe(true);
  });

  it("applies the light register when the stored preference is light", async () => {
    const dom = installFakeDom(true); // OS says dark; explicit light must win.
    dom.store.set("theme", "light");
    const { syncThemeFromPreference } = await theme();

    expect(syncThemeFromPreference()).toEqual({ preference: "light", theme: "light" });
    expect(dom.attributes["data-theme"]).toBe("light");
    expect(dom.classes.has("dark")).toBe(false);
  });

  it("follows the OS only while the preference is system", async () => {
    const dom = installFakeDom(true);
    const { syncThemeFromPreference } = await theme();

    expect(syncThemeFromPreference()).toEqual({ preference: "system", theme: "dark" });
    expect(dom.attributes["data-theme"]).toBe("dark");
  });

  it("persists an explicit choice and clears storage for system", async () => {
    const dom = installFakeDom(false);
    const { applyThemePreference } = await theme();

    expect(applyThemePreference("dark")).toBe("dark");
    expect(dom.store.get("theme")).toBe("dark");
    expect(dom.attributes["data-theme"]).toBe("dark");

    expect(applyThemePreference("system")).toBe("light");
    expect(dom.store.has("theme")).toBe(false);
    expect(dom.attributes["data-theme"]).toBe("light");
  });

  it("notifies other controls through the shared event", async () => {
    const dom = installFakeDom(false);
    const { applyThemePreference } = await theme();

    applyThemePreference("dark");
    expect(dom.events).toContain("behalf-theme-change");
  });

  it("re-asserting a lost data-theme restores it without a timer", async () => {
    const dom = installFakeDom(false);
    dom.store.set("theme", "dark");
    const { syncThemeFromPreference } = await theme();
    syncThemeFromPreference();

    // Exactly what React 19 does when it re-acquires the <html> singleton.
    delete dom.attributes["data-theme"];
    dom.classes.delete("dark");

    syncThemeFromPreference();
    expect(dom.attributes["data-theme"]).toBe("dark");
    expect(dom.classes.has("dark")).toBe(true);
  });

  it("ignores OS changes once an explicit preference is stored", async () => {
    const dom = installFakeDom(true);
    dom.store.set("theme", "light");
    const { subscribeToThemeChanges } = await theme();

    const onChange = vi.fn();
    subscribeToThemeChanges(onChange);
    for (const fn of dom.listeners.__media) fn();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reacts to OS changes while on system", async () => {
    const dom = installFakeDom(true);
    const { subscribeToThemeChanges } = await theme();

    const onChange = vi.fn();
    subscribeToThemeChanges(onChange);
    for (const fn of dom.listeners.__media) fn();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes cleanly", async () => {
    const dom = installFakeDom(false);
    const { subscribeToThemeChanges } = await theme();

    const onChange = vi.fn();
    subscribeToThemeChanges(onChange)();
    expect(dom.listeners["behalf-theme-change"]).toEqual([]);
  });
});

describe("only lib/theme.ts writes theme state", () => {
  const CONTROLS = [
    "components/ui/ThemeToggle.tsx",
    "components/design-system/DsAppearanceToggle.tsx"
  ];

  it.each(CONTROLS)("%s does not touch localStorage or the DOM directly", (path) => {
    const file = code(path);
    expect(file).not.toContain("localStorage");
    expect(file).not.toContain("setAttribute");
    expect(file).not.toContain("classList");
    expect(file).not.toContain("matchMedia");
  });

  it.each(CONTROLS)("%s drives the theme through the shared contract", (path) => {
    const file = code(path);
    expect(file).toContain("syncThemeFromPreference");
    expect(file).toContain("applyThemePreference");
    expect(file).toContain("subscribeToThemeChanges");
  });

  it("neither control uses a timer or poll to hold the theme", () => {
    for (const path of CONTROLS) {
      const file = code(path);
      expect(file).not.toContain("setTimeout");
      expect(file).not.toContain("setInterval");
      expect(file).not.toContain("requestAnimationFrame");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. consent-ping stays same-origin on every host.
// ---------------------------------------------------------------------------

describe("consent-ping is host-neutral", () => {
  const HOSTS = [
    "www.behalfid.com",
    "auth.behalfid.com",
    "app.behalfid.com",
    "console.behalfid.com",
    "docs.behalfid.com"
  ];

  it.each(HOSTS)("is never redirected away from %s", async (hostname) => {
    const { resolveSubdomainRedirect } = await import("@/lib/subdomainRouting");
    expect(
      resolveSubdomainRedirect({ hostname, pathname: "/api/consent-ping" })
    ).toBeNull();
  });

  it("is host-neutral behind a locale prefix too", async () => {
    const { isHostNeutralPath, resolveSubdomainRedirect } = await import("@/lib/subdomainRouting");
    expect(isHostNeutralPath("/de/api/consent-ping")).toBe(true);
    expect(
      resolveSubdomainRedirect({ hostname: "app.behalfid.com", pathname: "/de/api/consent-ping" })
    ).toBeNull();
  });

  it("no longer claims the path for the auth app", () => {
    expect(code("lib/subdomainRouting.ts")).not.toContain('"/api/consent-ping"\n    ]');
  });

  it("the route itself reads no session and sets no cookie", () => {
    const route = source("app/api/consent-ping/route.ts");
    expect(route).not.toContain("cookies");
    expect(route).not.toContain("getCurrentDeveloper");
    expect(route).not.toContain("requireDeveloperApi");
  });

  it("the banner still posts to the relative, same-origin path", () => {
    const banner = code("components/ui/CookieBanner.tsx");
    expect(banner).toContain('fetch("/api/consent-ping"');
    expect(banner).not.toContain("auth.behalfid.com");
    expect(banner).not.toContain("https://");
  });

  it("still redirects genuinely auth-owned API paths (no over-reach)", async () => {
    const { resolveSubdomainRedirect } = await import("@/lib/subdomainRouting");
    expect(
      resolveSubdomainRedirect({ hostname: "www.behalfid.com", pathname: "/api/onboarding" })
    ).toBe("https://auth.behalfid.com/api/onboarding");
    expect(
      resolveSubdomainRedirect({ hostname: "www.behalfid.com", pathname: "/login" })
    ).toBe("https://auth.behalfid.com/login");
  });
});

// ---------------------------------------------------------------------------
// 4. CSP stays narrow, and no CORS was introduced.
// ---------------------------------------------------------------------------

describe("Content-Security-Policy", () => {
  async function csp(isDev: boolean) {
    const { buildCsp } = await import("@/proxy");
    return buildCsp("test-nonce", isDev);
  }

  it("keeps connect-src restricted to the same origin plus the analytics ingest", async () => {
    for (const isDev of [true, false]) {
      expect(await csp(isDev)).toContain("connect-src 'self'");
    }
  });

  it("introduces no wildcard or cross-subdomain connect origin", async () => {
    // The analytics ingest is the ONLY third-party connect origin, and it is a
    // single pinned https host — no wildcard, no cross-subdomain widening.
    for (const isDev of [true, false]) {
      const policy = await csp(isDev);
      const connect = policy.split("; ").find((d) => d.startsWith("connect-src"));
      expect(connect).toBe("connect-src 'self' https://in.heycatch.ai");
      expect(policy).not.toContain("*.behalfid.com");
      expect(policy).not.toContain("connect-src *");
      expect(policy).not.toContain("auth.behalfid.com");
      expect(policy).not.toMatch(/connect-src[^;]*\*/);
    }
  });

  it("keeps the production script policy nonce-based", async () => {
    const policy = await csp(false);
    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("keeps frame-ancestors, base-uri and form-action locked down", async () => {
    const policy = await csp(false);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it("adds no CORS allowance anywhere in the proxy", () => {
    const proxy = code("proxy.ts");
    expect(proxy).not.toContain("Access-Control-Allow-Origin");
    expect(proxy).not.toContain("Access-Control-Allow-Credentials");
  });

  it("adds no CORS allowance on the consent route", () => {
    const route = code("app/api/consent-ping/route.ts");
    expect(route).not.toContain("Access-Control-Allow-Origin");
    expect(route).not.toContain("OPTIONS");
  });
});
