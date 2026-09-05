import { createEvidence, EvidenceContext, EvidenceRecord } from '../../core/evidence';
import { MerakiClient } from './merakiClient';
import {
  MerakiCacheMetadata,
  MerakiDevice,
  MerakiEvidenceResult,
  MerakiNetwork,
  MerakiOrganization,
  MerakiRequestOptions,
  MerakiResponseMetadata,
} from './merakiTypes';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CachedCollection<T> {
  data: T[];
  response: MerakiResponseMetadata;
}

export class MerakiTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number = 30000) {}

  get(key: string, now = Date.now()): { value: T; expiresAt: number } | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: T, now = Date.now()): number {
    const expiresAt = now + this.ttlMs;
    this.entries.set(key, { value, expiresAt });
    return expiresAt;
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface MerakiEvidenceServiceOptions {
  cache?: MerakiTtlCache<unknown>;
  cacheTtlMs?: number;
  now?: () => number;
}

export class MerakiEvidenceService {
  private readonly cache: MerakiTtlCache<unknown>;
  private readonly now: () => number;

  constructor(
    private readonly client: MerakiClient,
    options: MerakiEvidenceServiceOptions = {}
  ) {
    this.cache = options.cache ?? new MerakiTtlCache(options.cacheTtlMs);
    this.now = options.now ?? Date.now;
  }

  async getOrganizations(options: MerakiRequestOptions = {}): Promise<MerakiEvidenceResult<MerakiOrganization[]>> {
    return this.getCollection('/organizations', options, 'organizations');
  }

  async getOrganizationNetworks(organizationId: string, options: MerakiRequestOptions = {}): Promise<MerakiEvidenceResult<MerakiNetwork[]>> {
    return this.getCollection(`/organizations/${encodeURIComponent(organizationId)}/networks`, options, `organizations/${organizationId}/networks`, { organizationId });
  }

  async getOrganizationDevices(organizationId: string, options: MerakiRequestOptions = {}): Promise<MerakiEvidenceResult<MerakiDevice[]>> {
    return this.getCollection(`/organizations/${encodeURIComponent(organizationId)}/devices`, options, `organizations/${organizationId}/devices`, { organizationId });
  }

  private async getCollection<T>(
    endpoint: string,
    options: MerakiRequestOptions,
    cacheEndpoint: string,
    context: EvidenceContext = {}
  ): Promise<MerakiEvidenceResult<T[]>> {
    const cacheKey = this.cacheKey(cacheEndpoint, options.query);
    const cached = options.bypassCache ? undefined : this.cache.get(cacheKey, this.now());
    if (cached) {
      const cachedCollection = cached.value as CachedCollection<T>;
      const response = cachedCollection.response;
      return {
        data: cachedCollection.data,
        evidence: this.toEvidence(cachedCollection.data, endpoint, response, context, this.now()),
        cache: { cacheHit: true, cacheKey, expiresAt: cached.expiresAt },
        response,
      };
    }

    const page = await this.client.getAllPages<T>(endpoint, options);
    const response = page.metadata[page.metadata.length - 1] ?? this.cachedResponse();
    const expiresAt = this.cache.set(cacheKey, { data: page.data, response }, this.now());
    return {
      data: page.data,
      evidence: this.toEvidence(page.data, endpoint, response, context, this.now()),
      cache: { cacheHit: false, cacheKey, expiresAt },
      response,
    };
  }

  private toEvidence<T>(
    data: T[],
    endpoint: string,
    response: MerakiResponseMetadata,
    context: EvidenceContext,
    collectedAtMs: number
  ): EvidenceRecord<T[]> {
    const collectedAt = new Date(collectedAtMs).toISOString();
    const observedAt = this.findTimestamp(data) ?? collectedAt;
    return createEvidence({
      type: 'VENDOR_REPORTED',
      name: `meraki.${endpoint.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '.')}`,
      value: data,
      source: {
        name: 'Cisco Meraki Dashboard API',
        vendor: 'Cisco Meraki',
        collector: 'merakiEvidenceService',
        endpoint,
        requestId: response.requestId,
      },
      context,
      observedAt,
      collectedAt,
    });
  }

  private findTimestamp(value: unknown): string | undefined {
    if (!Array.isArray(value)) return undefined;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const candidate = (item as Record<string, unknown>).updatedAt ??
        (item as Record<string, unknown>).lastUpdatedAt ??
        (item as Record<string, unknown>).createdAt;
      if (typeof candidate === 'string' && Number.isFinite(Date.parse(candidate))) return new Date(candidate).toISOString();
    }
    return undefined;
  }

  private cacheKey(endpoint: string, query?: Record<string, string | number | boolean | undefined>): string {
    const queryString = Object.entries(query ?? {})
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return queryString ? `${endpoint}?${queryString}` : endpoint;
  }

  private cachedResponse(): MerakiResponseMetadata {
    return { status: 200, headers: {} };
  }
}
