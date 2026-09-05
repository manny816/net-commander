import * as assert from 'assert';
import { SecretProvider } from '../src/core/secrets';

import {
  MerakiApiError,
  MerakiClient,
  MerakiEvidenceService,
  MerakiConfigurationError,
  validateMerakiConnection,
} from '../src/integrations/meraki';

interface Call {
  url: string;
  init?: RequestInit;
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

class FakeSecretProvider implements SecretProvider {
  private readonly values = new Map<string, string>();

  async getSecret(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('SecretProvider contract', () => {
  it('supports set, get, and delete with an in-memory provider', async () => {
    const provider = new FakeSecretProvider();
    await provider.setSecret('test.key', 'secret-value');
    assert.strictEqual(await provider.getSecret('test.key'), 'secret-value');
    await provider.deleteSecret('test.key');
    assert.strictEqual(await provider.getSecret('test.key'), undefined);
  });
});

describe('MerakiClient', () => {
  it('receives the API key through SecretProvider injection', async () => {
    const provider = new FakeSecretProvider();
    await provider.setSecret('jcg.meraki.apiKey', 'injected-secret');
    let header: string | undefined;
    const client = new MerakiClient({
      apiKey: provider,
      fetchFn: async (_url, init) => {
        header = (init?.headers as Record<string, string>)['X-Cisco-Meraki-API-Key'];
        return response([]);
      },
    });

    await client.get('/organizations');
    assert.strictEqual(header, 'injected-secret');
  });

  it('rejects empty injected credentials without exposing them', async () => {
    const provider = new FakeSecretProvider();
    const client = new MerakiClient({ apiKey: provider });

    await assert.rejects(client.get('/organizations'), (error: MerakiConfigurationError) => {
      assert.strictEqual(error.message, 'Meraki API key was not provided');
      return true;
    });
  });

  it('redacts a credential echoed by an API error', async () => {
    const secret = 'injected-secret';
    const client = new MerakiClient({
      apiKey: secret,
      maxRetries: 0,
      fetchFn: async () => response({ error: `echoed ${secret}` }, 403, { 'x-request-id': 'req-error' }),
    });

    await assert.rejects(client.get('/organizations'), error => {
      const serialized = JSON.stringify(error);
      assert.ok(!serialized.includes(secret));
      assert.ok(serialized.includes('req-error'));
      return true;
    });
  });

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

describe('Meraki connection validation', () => {
  it('validates one read-only organizations request and normalizes names', async () => {
    const provider = new FakeSecretProvider();
    await provider.setSecret('jcg.meraki.apiKey', 'validation-secret');
    const requests: Array<{ url: string; method?: string }> = [];

    const result = await validateMerakiConnection(provider, secrets => new MerakiClient({
      apiKey: secrets,
      fetchFn: async (url, init) => {
        requests.push({ url, method: init?.method });
        if (url.endsWith('/organizations')) {
          return response([
            { id: 'org-1', name: 'JCG Solutions' },
            { id: 'org-lvmh', name: 'LVMH BeautyTech AMER' },
          ], 200, { 'x-request-id': 'validation-request-1' });
        }
        if (url.endsWith('/organizations/org-lvmh/networks')) {
          return response(
            [{ id: 'network-1', name: 'Beauty Lab' }],
            200,
            {
              'x-request-id': 'validation-network-1',
              link: '<https://api.meraki.com/api/v1/organizations/org-lvmh/networks?page=2>; rel="next"',
            },
          );
        }
        if (url.endsWith('/organizations/org-lvmh/networks?page=2')) {
          return response([{ id: 'network-2', name: 'Beauty Store' }], 200, { 'x-request-id': 'validation-network-2' });
        }
        if (url.endsWith('/organizations/org-lvmh/devices')) {
          return response([
            { serial: 'device-1', productType: 'wireless' },
            { serial: 'device-2', productType: 'switch' },
            { serial: 'device-3', productType: 'wireless' },
          ], 200, { 'x-request-id': 'validation-device-1' });
        }
        throw new Error(`Unexpected validation URL: ${url}`);
      },
    }));

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.organizations, ['JCG Solutions', 'LVMH BeautyTech AMER']);
    assert.strictEqual(result.evidenceNormalization, 'PASS');
    assert.strictEqual(result.credentialExposure, 'PASS');
    assert.strictEqual(result.requestId, 'validation-request-1');
    assert.deepStrictEqual(result.gate2, {
      organizationName: 'LVMH BeautyTech AMER',
      networkCount: 2,
      deviceCount: 3,
      devicesByProductType: { wireless: 2, switch: 1 },
      evidenceNormalization: 'PASS',
      pagination: 'PASS',
      cacheSummary: 'Organizations: BYPASSED; Networks: MISS; Devices: MISS',
      accessMode: 'READ ONLY',
    });
    assert.deepStrictEqual(requests, [
      { url: 'https://api.meraki.com/api/v1/organizations', method: 'GET' },
      { url: 'https://api.meraki.com/api/v1/organizations/org-lvmh/networks', method: 'GET' },
      { url: 'https://api.meraki.com/api/v1/organizations/org-lvmh/networks?page=2', method: 'GET' },
      { url: 'https://api.meraki.com/api/v1/organizations/org-lvmh/devices', method: 'GET' },
    ]);
    assert.ok(!JSON.stringify(result).includes('validation-secret'));
  });

  it('stops without an API request when Meraki is not configured', async () => {
    const provider = new FakeSecretProvider();
    let called = false;
    const result = await validateMerakiConnection(provider, () => {
      called = true;
      return new MerakiClient({ apiKey: 'unused' });
    });

    assert.strictEqual(result.message, 'Meraki is not configured.');
    assert.strictEqual(result.apiReachability, 'NOT RUN');
    assert.strictEqual(called, false);
  });

  it('sanitizes authentication failures', async () => {
    const provider = new FakeSecretProvider();
    await provider.setSecret('jcg.meraki.apiKey', 'validation-secret');
    const result = await validateMerakiConnection(provider, secrets => new MerakiClient({
      apiKey: secrets,
      maxRetries: 0,
      fetchFn: async () => response({ error: 'unauthorized' }, 401),
    }));

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.message, 'Meraki authentication failed.');
    assert.ok(!JSON.stringify(result).includes('validation-secret'));
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
    assert.ok(!JSON.stringify(first.evidence).includes('test-secret-key'));
    assert.ok(!first.cache.cacheKey.includes('test-secret-key'));
    assert.strictEqual(second.response.requestId, 'req-1');
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
