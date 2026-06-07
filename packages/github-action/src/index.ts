import * as core from '@actions/core';
import { verifyAction } from './verify-client';

async function run(): Promise<void> {
  // Mask the API key before any logging so it never appears in step output
  const apiKey = core.getInput('api-key', { required: true });
  core.setSecret(apiKey);

  const agentId = core.getInput('agent-id', { required: true });
  const action = core.getInput('action', { required: true });
  const resource = core.getInput('resource') || undefined;
  const risk = core.getInput('risk') || 'medium';
  const metadataRaw = core.getInput('metadata') || '{}';
  const baseUrl = core.getInput('base-url') || 'https://behalfid.com';

  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(metadataRaw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    core.warning('metadata input is not valid JSON — using empty metadata.');
  }

  // Attach CI context so BehalfID logs show which workflow triggered the check
  metadata['_ci'] = {
    risk,
    workflow: process.env['GITHUB_WORKFLOW'] ?? '',
    run_id: process.env['GITHUB_RUN_ID'] ?? '',
    actor: process.env['GITHUB_ACTOR'] ?? '',
    repo: process.env['GITHUB_REPOSITORY'] ?? '',
    ref: process.env['GITHUB_REF_NAME'] ?? '',
    sha: (process.env['GITHUB_SHA'] ?? '').slice(0, 8),
  };

  core.info(`BehalfID: verifying "${action}"${resource ? ` on ${resource}` : ''}`);

  let result: Awaited<ReturnType<typeof verifyAction>>;
  try {
    result = await verifyAction({ apiKey, agentId, action, resource, metadata, baseUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Any exception (network, parse, unexpected) fails closed
    core.setFailed(`BehalfID verify failed — ${message}`);
    return;
  }

  const decision = result.allowed ? 'allowed' : 'denied';
  core.setOutput('request-id', result.requestId ?? '');
  core.setOutput('reason', result.reason ?? '');
  core.setOutput('decision', decision);

  if (result.allowed) {
    core.info(`BehalfID: allowed — ${result.reason}`);
    core.info(`Request ID: ${result.requestId}`);
    return;
  }

  const isApprovalRequired = /approval.required|requires approval|pending approval/i.test(
    result.reason ?? ''
  );

  if (isApprovalRequired) {
    core.setFailed(
      `BehalfID: Approval required — ${result.reason} [request: ${result.requestId}]`
    );
  } else {
    core.setFailed(
      `BehalfID: Denied — ${result.reason} [request: ${result.requestId}]`
    );
  }
}

run();
