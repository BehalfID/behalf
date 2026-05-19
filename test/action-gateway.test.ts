import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  httpRequest: vi.fn(),
  httpsRequest: vi.fn()
}));

vi.mock("dns/promises", () => ({
  default: { lookup: gatewayMocks.dnsLookup }
}));
vi.mock("http", () => ({
  default: { request: gatewayMocks.httpRequest },
  request: gatewayMocks.httpRequest
}));
vi.mock("https", () => ({
  default: { request: gatewayMocks.httpsRequest },
  request: gatewayMocks.httpsRequest
}));

function mockHttpResponse({
  status = 200,
  headers = { "content-type": "text/plain" },
  body = "ok"
}: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}) {
  return vi.fn((_url, _options, callback) => {
    const response = Readable.from([body]) as Readable & {
      statusCode: number;
      headers: Record<string, string>;
      resume: () => void;
    };
    response.statusCode = status;
    response.headers = headers;
    response.resume = vi.fn();
    callback(response);
    return {
      on: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn()
    };
  });
}

describe("Action Gateway public fetch enforcement", () => {
  beforeEach(() => {
    gatewayMocks.dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    gatewayMocks.httpRequest.mockImplementation(mockHttpResponse({ body: "hello" }));
    gatewayMocks.httpsRequest.mockImplementation(mockHttpResponse({ body: "hello" }));
  });

  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://[::1]/"
  ])("blocks private or internal URL %s", async (url) => {
    const { fetchPublicWebRead } = await import("@/lib/actionGateway");

    await expect(fetchPublicWebRead(url)).rejects.toThrow(/not public|not allowed|host is not public/);
    expect(gatewayMocks.httpRequest).not.toHaveBeenCalled();
    expect(gatewayMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("blocks public hostnames that resolve to private addresses", async () => {
    gatewayMocks.dnsLookup.mockResolvedValue([{ address: "10.0.0.4", family: 4 }]);
    const { fetchPublicWebRead } = await import("@/lib/actionGateway");

    await expect(fetchPublicWebRead("https://example.com/")).rejects.toThrow(
      "Gateway URL resolves to a non-public address."
    );
    expect(gatewayMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("passes a DNS-pinned lookup function to the HTTP client", async () => {
    gatewayMocks.dnsLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 }
    ]);
    const { fetchPublicWebRead } = await import("@/lib/actionGateway");

    await fetchPublicWebRead("https://example.com/");

    expect(gatewayMocks.httpsRequest).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ lookup: expect.any(Function) }),
      expect.any(Function)
    );

    const options = gatewayMocks.httpsRequest.mock.calls[0][1];
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);

    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(gatewayMocks.dnsLookup).toHaveBeenCalledTimes(1);
  });

  it("blocks redirects to private/internal addresses", async () => {
    gatewayMocks.httpRequest.mockImplementation(
      mockHttpResponse({
        status: 302,
        headers: { location: "http://127.0.0.1/admin", "content-type": "text/plain" },
        body: ""
      })
    );
    const { fetchPublicWebRead } = await import("@/lib/actionGateway");

    await expect(fetchPublicWebRead("http://example.com/")).rejects.toThrow("Gateway URL IP address is not public.");
    expect(gatewayMocks.httpRequest).toHaveBeenCalledTimes(1);
  });

  it("caps oversized text responses and marks them truncated", async () => {
    gatewayMocks.httpsRequest.mockImplementation(
      mockHttpResponse({ body: "a".repeat(70 * 1024) })
    );
    const { fetchPublicWebRead } = await import("@/lib/actionGateway");

    const result = await fetchPublicWebRead("https://example.com/page");

    expect(result.truncated).toBe(true);
    expect(result.excerpt.length).toBeLessThanOrEqual(4_000);
  });
});
