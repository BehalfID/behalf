import { describe, expect, it } from "vitest";
import {
  isSubdomainRoutingEnabled,
  resolveAppForHost,
  resolveOwnedHref,
  resolveOwnerForPath,
  resolveSessionCookieDomain,
  resolveSubdomainHosts,
  resolveSubdomainRedirect
} from "@/lib/subdomainRouting";

describe("subdomain routing ownership", () => {
  it("maps auth and app paths", () => {
    expect(resolveOwnerForPath("/login")).toBe("auth");
    expect(resolveOwnerForPath("/signup")).toBe("auth");
    expect(resolveOwnerForPath("/api/auth/me")).toBe("auth");
    expect(resolveOwnerForPath("/dashboard")).toBe("app");
    expect(resolveOwnerForPath("/workspace/acme/dashboard")).toBe("app");
    expect(resolveOwnerForPath("/acme/dashboard/agents")).toBe("app");
    expect(resolveOwnerForPath("/console")).toBe("console");
    expect(resolveOwnerForPath("/docs/sdk")).toBe("docs");
    expect(resolveOwnerForPath("/")).toBe("www");
  });

  it("resolves hosts from env overrides", () => {
    const hosts = resolveSubdomainHosts({
      BEHALFID_HOST_AUTH: "auth.staging.example.com"
    });
    expect(hosts.auth).toBe("auth.staging.example.com");
    expect(hosts.app).toBe("app.behalfid.com");
  });

  it("redirects out-of-scope paths when routing is targeted at a known host", () => {
    const url = resolveSubdomainRedirect({
      hostname: "app.behalfid.com",
      pathname: "/login",
      search: "?next=%2Fdashboard",
      protocol: "https:"
    });
    expect(url).toBe("https://auth.behalfid.com/login?next=%2Fdashboard");
  });

  it("does not redirect in-scope paths", () => {
    expect(
      resolveSubdomainRedirect({
        hostname: "auth.behalfid.com",
        pathname: "/login"
      })
    ).toBeNull();
  });

  it("ignores unknown hosts (apex single-app deploy)", () => {
    expect(
      resolveSubdomainRedirect({
        hostname: "localhost",
        pathname: "/login"
      })
    ).toBeNull();
    expect(resolveAppForHost("preview-abc.vercel.app")).toBeNull();
  });
  it("builds absolute cross-app hrefs from a known subdomain host", () => {
    expect(
      resolveOwnedHref("/dashboard/agents/new?focus=profiles", {
        hostname: "auth.behalfid.com",
        protocol: "https:"
      })
    ).toBe("https://app.behalfid.com/dashboard/agents/new?focus=profiles");

    expect(
      resolveOwnedHref("/login?next=%2Fdashboard", {
        hostname: "app.behalfid.com",
        protocol: "https:"
      })
    ).toBe("https://auth.behalfid.com/login?next=%2Fdashboard");

    expect(
      resolveOwnedHref("/dashboard", {
        hostname: "app.behalfid.com"
      })
    ).toBe("/dashboard");
  });

  it("keeps relative hrefs on apex / unknown hosts", () => {
    expect(
      resolveOwnedHref("/dashboard", {
        hostname: "behalfid.com"
      })
    ).toBe("/dashboard");
    expect(
      resolveOwnedHref("/login", {
        hostname: "localhost"
      })
    ).toBe("/login");
  });
});

describe("subdomain env gates", () => {
  it("defaults routing off", () => {
    expect(isSubdomainRoutingEnabled({})).toBe(false);
    expect(isSubdomainRoutingEnabled({ BEHALFID_SUBDOMAIN_ROUTING: "1" })).toBe(true);
  });

  it("normalizes cookie domain with leading dot", () => {
    expect(resolveSessionCookieDomain({})).toBeUndefined();
    expect(resolveSessionCookieDomain({ BEHALFID_COOKIE_DOMAIN: "behalfid.com" })).toBe(
      ".behalfid.com"
    );
    expect(resolveSessionCookieDomain({ BEHALFID_COOKIE_DOMAIN: ".behalfid.com" })).toBe(
      ".behalfid.com"
    );
  });
});
