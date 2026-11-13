import { describe, expect, it } from "vitest";
import { isBlockedEgressHost, resolvePublicEgressAddress } from "@/lib/egressAuthorize";
import { isPrivateIpAddress } from "@/lib/webhooks";

describe("isPrivateIpAddress IPv6 canonicalization", () => {
  it.each([
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "[::1]",
    // IPv4-mapped loopback / metadata in every spelling
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0::ffff:127.0.0.1",
    "0:0::ffff:7f00:1",
    "0:0:0:0:0:ffff:169.254.169.254",
    "::FFFF:A9FE:A9FE",
    // IPv4-compatible (deprecated) and IPv4-translated
    "::127.0.0.1",
    "::10.0.0.1",
    "::ffff:0:127.0.0.1",
    // NAT64, 6to4 with private embedded IPv4, Teredo, documentation, discard
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "2002:7f00:1::",
    "2002:a9fe:a9fe::1",
    "2002:c0a8:0101::1",
    "2001::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2001:db8::1",
    "100::1",
    // ULA, link-local (incl. zone id), site-local, multicast
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1",
    "feff::1",
    "ff02::1"
  ])("treats %s as private", (address) => {
    expect(isPrivateIpAddress(address)).toBe(true);
  });

  it.each([
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a00:1450:4001:82a::200e",
    "2002:808:808::1"
  ])("treats public %s as public", (address) => {
    expect(isPrivateIpAddress(address)).toBe(false);
  });

  it("keeps IPv4 classification unchanged", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
  });
});

describe("egress host guard rejects non-canonical IPv4-mapped loopback", () => {
  it("blocks 0::ffff:127.0.0.1 before any permission check", async () => {
    expect(isBlockedEgressHost("0::ffff:127.0.0.1").blocked).toBe(true);
    expect(isBlockedEgressHost("::127.0.0.1").blocked).toBe(true);
    const resolved = await resolvePublicEgressAddress("0::ffff:127.0.0.1");
    expect(resolved.blocked).toBe(true);
  });
});
