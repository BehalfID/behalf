export type RiskLevel = 'low' | 'medium' | 'high';

export type VerifyOptions = {
  apiKey: string;
  agentId: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  baseUrl?: string;
};

export type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
};

export async function verifyAction(opts: VerifyOptions): Promise<VerifyResult> {
  const baseUrl = (opts.baseUrl ?? 'https://behalfid.com').replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Authorization header is masked by @actions/core before this call runs
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        agentId: opts.agentId,
        action: opts.action,
        ...(opts.resource ? { resource: opts.resource } : {}),
        ...(opts.metadata && Object.keys(opts.metadata).length > 0
          ? { metadata: opts.metadata }
          : {}),
      }),
    });
  } catch {
    throw new Error('Network request to BehalfID failed — failing closed.');
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = extractErrorMessage(body) ?? `HTTP ${response.status}`;
    throw new Error(`BehalfID API error: ${redactSecrets(apiMessage)}`);
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('BehalfID returned an unexpected response — failing closed.');
  }

  return body as VerifyResult;
}

function extractErrorMessage(body: unknown): string | null {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>)['error'] === 'string'
  ) {
    return (body as { error: string }).error;
  }
  return null;
}

// Belt-and-suspenders: mask known token shapes even if @actions/core masking is unavailable
function redactSecrets(message: string): string {
  return message
    .replace(/bhf_sk_[A-Za-z0-9_-]+/g, 'bhf_sk_[redacted]')
    .replace(/bhf_site_[A-Za-z0-9_-]+/g, 'bhf_site_[redacted]')
    .replace(/bhf_dev_[A-Za-z0-9_-]+/g, 'bhf_dev_[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}
