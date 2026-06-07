import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyAction } from '../src/verify-client';

const BASE_OPTS = {
  apiKey: 'bhf_sk_testkey123',
  agentId: 'agent_abc',
  action: 'deploy_production',
  resource: 'vercel',
  baseUrl: 'https://behalfid.com',
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal('fetch', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyAction — allowed decision', () => {
  it('resolves with VerifyResult when API returns allowed: true', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, {
        requestId: 'req_001',
        allowed: true,
        reason: 'Permitted by policy',
        risk: 'high',
      })
    );

    const result = await verifyAction(BASE_OPTS);
    expect(result.allowed).toBe(true);
    expect(result.requestId).toBe('req_001');
    expect(result.reason).toBe('Permitted by policy');
    expect(result.risk).toBe('high');
  });

  it('sends Authorization header with the api key', async () => {
    const fetchSpy = mockFetch(200, { requestId: 'r', allowed: true, reason: 'ok', risk: 'low' });
    vi.stubGlobal('fetch', fetchSpy);

    await verifyAction(BASE_OPTS);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${BASE_OPTS.apiKey}`);
  });

  it('includes resource and metadata in the request body', async () => {
    const fetchSpy = mockFetch(200, { requestId: 'r', allowed: true, reason: 'ok', risk: 'low' });
    vi.stubGlobal('fetch', fetchSpy);

    await verifyAction({ ...BASE_OPTS, metadata: { pr: '42' } });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.resource).toBe('vercel');
    expect(body.metadata).toEqual({ pr: '42' });
    expect(body.agentId).toBe('agent_abc');
    expect(body.action).toBe('deploy_production');
  });
});

describe('verifyAction — denied decision', () => {
  it('resolves (does not throw) with allowed: false when API denies', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, {
        requestId: 'req_002',
        allowed: false,
        reason: 'Action exceeds permitted scope',
        risk: 'high',
      })
    );

    const result = await verifyAction(BASE_OPTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Action exceeds permitted scope');
    expect(result.requestId).toBe('req_002');
  });

  it('resolves with allowed: false when approval is required', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, {
        requestId: 'req_003',
        allowed: false,
        reason: 'Approval required from account owner',
        risk: 'high',
      })
    );

    const result = await verifyAction(BASE_OPTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/approval required/i);
  });
});

describe('verifyAction — API errors fail closed', () => {
  it('throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(verifyAction(BASE_OPTS)).rejects.toThrow(
      'Network request to BehalfID failed'
    );
  });

  it('throws on HTTP 401 Unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, { error: 'Invalid API key' })
    );

    await expect(verifyAction(BASE_OPTS)).rejects.toThrow('BehalfID API error');
  });

  it('throws on HTTP 500 with generic message', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'Internal server error' }));

    await expect(verifyAction(BASE_OPTS)).rejects.toThrow('BehalfID API error');
  });

  it('throws on non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response));

    await expect(verifyAction(BASE_OPTS)).rejects.toThrow('unexpected response');
  });
});

describe('verifyAction — secret masking', () => {
  it('does not include the api key in thrown error messages', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, { error: `Invalid key bhf_sk_testkey123 provided` })
    );

    const err = await verifyAction(BASE_OPTS).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('bhf_sk_testkey123');
    expect((err as Error).message).toContain('[redacted]');
  });

  it('redacts Bearer tokens from error messages', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(403, { error: 'Bearer bhf_sk_testkey123 is revoked' })
    );

    const err = await verifyAction(BASE_OPTS).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('bhf_sk_testkey123');
  });
});

describe('verifyAction — request shape', () => {
  it('omits resource key when resource is not provided', async () => {
    const fetchSpy = mockFetch(200, { requestId: 'r', allowed: true, reason: 'ok', risk: 'low' });
    vi.stubGlobal('fetch', fetchSpy);

    await verifyAction({ ...BASE_OPTS, resource: undefined });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect('resource' in body).toBe(false);
  });

  it('omits metadata key when metadata is empty', async () => {
    const fetchSpy = mockFetch(200, { requestId: 'r', allowed: true, reason: 'ok', risk: 'low' });
    vi.stubGlobal('fetch', fetchSpy);

    await verifyAction({ ...BASE_OPTS, metadata: {} });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect('metadata' in body).toBe(false);
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchSpy = mockFetch(200, { requestId: 'r', allowed: true, reason: 'ok', risk: 'low' });
    vi.stubGlobal('fetch', fetchSpy);

    await verifyAction({ ...BASE_OPTS, baseUrl: 'https://behalfid.com/' });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://behalfid.com/api/verify');
  });
});
