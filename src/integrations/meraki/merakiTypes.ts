import { EvidenceRecord } from '../../core/evidence';

export interface MerakiCredentials {
  getApiKey(): string | Promise<string | undefined> | undefined;
}

export type MerakiApiKeyProvider = string | MerakiCredentials | (() => string | Promise<string | undefined> | undefined);

export interface MerakiRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  bypassCache?: boolean;
}

export interface MerakiRateLimitMetadata {
  limit?: number;
  remaining?: number;
  retryAfterMs?: number;
}

export interface MerakiResponseMetadata {
  status: number;
  headers: Record<string, string>;
  requestId?: string;
  rateLimit?: MerakiRateLimitMetadata;
  nextLink?: string;
}

export interface MerakiPage<T> {
  data: T;
  metadata: MerakiResponseMetadata;
}

export interface MerakiCacheMetadata {
  cacheHit: boolean;
  cacheKey: string;
  expiresAt?: number;
}

export interface MerakiEvidenceResult<T> {
  data: T;
  evidence: EvidenceRecord<T>;
  cache: MerakiCacheMetadata;
  response: MerakiResponseMetadata;
}

export interface MerakiOrganization {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MerakiNetwork {
  id: string;
  organizationId?: string;
  name: string;
  [key: string]: unknown;
}

export interface MerakiDevice {
  serial?: string;
  name?: string;
  networkId?: string;
  productType?: string;
  [key: string]: unknown;
}

export type MerakiFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type MerakiSleep = (milliseconds: number) => Promise<void>;
