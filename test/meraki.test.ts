import * as assert from 'assert';

import {
  MerakiApiError,
  MerakiClient,
  MerakiEvidenceService,
} from '../src/integrations/meraki';

interface Call {
  url: string;
  init?: RequestInit;
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

describe('MerakiClient', () => {
  it('performs a GET with an injected API key and preserves request metadata', async () => {
    const calls: Call[] = [];
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response([{ id: 'org-1', name: 'JCG' }], 200, { 'x-request-id': 'req-123' });
      },
    });

    const result = await client.get('/organizations');
    const headers = calls[0].init?.headers as Record<string, string>;

    assert.deepStrictEqual(result.data, [{ id: 'org-1', name: 'JCG' }]);
    assert.strictEqual(calls[0].init?.method, 'GET');
    assert.strictEqual(headers['X-Cisco-Meraki-API-Key'], 'test-secret-key');
    assert.strictEqual(result.metadata.requestId, 'req-123');
  });

  it('honors Retry-After for bounded 429 retries', async () => {
    let calls = 0;
    const delays: number[] = [];
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      maxRetries: 2,
      sleep: async milliseconds => { delays.push(milliseconds); },
      fetchFn: async () => {
        calls += 1;
        return calls === 3
          ? response([{ id: 'org-1' }])
          : response({ error: 'rate limited' }, 429, { 'retry-after': '2' });
      },
    });

    const result = await client.get('/organizations');
    assert.strictEqual(result.data[0].id, 'org-1');
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(delays, [2000, 2000]);
  });

  it('stops retrying after the configured bound', async () => {
    let calls = 0;
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      maxRetries: 1,
      sleep: async () => undefined,
      fetchFn: async () => {
        calls += 1;
        return response({ error: 'rate limited' }, 429, { 'x-rate-limit-remaining': '0' });
      },
    });

    await assert.rejects(client.get('/organizations'), (error: MerakiApiError) => {
      assert.strictEqual(error.status, 429);
      assert.strictEqual(error.rateLimit?.remaining, 0);
      return true;
    });
    assert.strictEqual(calls, 2);
  });

  it('follows Link pagination and rejects malformed links', async () => {
    const urls: string[] = [];
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async url => {
        urls.push(url);
        return urls.length === 1
          ? response([{ id: 'one' }], 200, { link: '<https://api.meraki.com/api/v1/organizations?page=2>; rel="next"' })
          : response([{ id: 'two' }], 200, { 'x-request-id': 'req-page-2' });
      },
    });

    const result = await client.getAllPages<{ id: string }>('/organizations');
    assert.deepStrictEqual(result.data.map(item => item.id), ['one', 'two']);
    assert.strictEqual(result.metadata[1].requestId, 'req-page-2');

    const malformed = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async () => response([], 200, { link: 'not-a-link' }),
    });
    await assert.rejects(malformed.getAllPages('/organizations'), /Malformed Meraki Link header/);

    const external = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async () => response([], 200, { link: '<https://example.invalid/organizations?page=2>; rel="next"' }),
    });
    await assert.rejects(external.getAllPages('/organizations'), /unexpected origin/);
  });

  it('rejects malformed successful responses', async () => {
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async () => response('{not-json'),
    });
    await assert.rejects(client.get('/organizations'), (error: MerakiApiError) => error.status === 200);
  });
});

describe('MerakiEvidenceService', () => {
  it('normalizes discovery data and reports cache hits and bypasses', async () => {
    let calls = 0;
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async (_url, init) => {
        calls += 1;
        assert.strictEqual(init?.method, 'GET');
        return response([{ id: 'org-1', name: 'JCG', updatedAt: '2026-09-05T12:00:00Z' }], 200, { 'x-request-id': `req-${calls}` });
      },
    });
    const service = new MerakiEvidenceService(client, { cacheTtlMs: 60000 });

    const first = await service.getOrganizations();
    const second = await service.getOrganizations();
    const bypassed = await service.getOrganizations({ bypassCache: true });

    assert.strictEqual(first.cache.cacheHit, false);
    assert.strictEqual(second.cache.cacheHit, true);
    assert.strictEqual(bypassed.cache.cacheHit, false);
    assert.strictEqual(calls, 2);
    assert.strictEqual(first.evidence.type, 'VENDOR_REPORTED');
    assert.strictEqual(first.evidence.source.vendor, 'Cisco Meraki');
    assert.strictEqual(first.evidence.source.collector, 'merakiEvidenceService');
    assert.strictEqual(first.evidence.source.endpoint, '/organizations');
    assert.strictEqual(first.evidence.source.requestId, 'req-1');
    assert.strictEqual(first.evidence.observedAt, '2026-09-05T12:00:00.000Z');
    assert.strictEqual(first.evidence.context?.organizationId, undefined);
  });

  it('preserves organization context for network and device discovery', async () => {
    const urls: string[] = [];
    const client = new MerakiClient({
      apiKey: 'test-secret-key',
      fetchFn: async url => {
        urls.push(url);
        return response([]);
      },
    });
    const service = new MerakiEvidenceService(client);

    const networks = await service.getOrganizationNetworks('org-7');
    const devices = await service.getOrganizationDevices('org-7');

    assert.strictEqual(networks.evidence.context?.organizationId, 'org-7');
    assert.strictEqual(devices.evidence.context?.organizationId, 'org-7');
    assert.ok(urls[0].includes('/organizations/org-7/networks'));
    assert.ok(urls[1].includes('/organizations/org-7/devices'));
  });
});
