# Meraki Evidence Service

## Architecture

The Meraki integration lives under `src/integrations/meraki/`:

- `merakiClient.ts` provides authenticated, read-only Dashboard API access.
- `merakiEvidenceService.ts` provides TTL caching and EvidenceRecord normalization.
- `merakiTypes.ts` defines transport, response, cache, credential, and discovery types.
- `merakiErrors.ts` defines structured API, configuration, and pagination errors.
- `index.ts` provides the integration export surface.

The initial service exposes only organization, organization-network, and organization-device discovery.

## Read-only guarantee

The client creates only `GET` requests. There are no POST, PUT, or DELETE methods. The service does not expose configuration mutation endpoints.

## Authentication model

A caller injects an API key string, a credential provider, or an object implementing `getApiKey()`. The integration does not choose where credentials are stored. API keys are sent only in the `X-Cisco-Meraki-API-Key` request header and are never logged, included in cache keys, or stored in EvidenceRecords.

Secure VS Code `SecretStorage` integration can be added at the composition boundary in a later milestone without changing the client or service contracts.

## Rate limits and retries

The client captures response headers, request IDs, and Meraki rate-limit metadata. It retries HTTP 408, 429, and 5xx responses with a bounded retry count. `Retry-After` is honored when present; otherwise exponential backoff with jitter is used. A retry loop always terminates.

## Caching

`MerakiTtlCache` is an in-memory TTL cache. The service key is derived from the endpoint and sorted query parameters only, never from credentials. Each result reports whether it was a cache hit and when the entry expires. Callers can bypass the cache per request. Cache entries retain response metadata so cached EvidenceRecords preserve request-ID provenance.

Redis and persistent storage are intentionally out of scope for this foundation.

## Pagination

`getAllPages()` follows Meraki `Link` headers with `rel="next"`. It rejects malformed links, repeated URLs, unexpected origins, and page counts over the configured maximum. Pagination is reusable for future read-only endpoints.

## Evidence normalization

Discovery responses become one `EvidenceRecord` with:

- `type: VENDOR_REPORTED`
- source vendor `Cisco Meraki`
- collector `merakiEvidenceService`
- endpoint and Meraki request ID when available
- organization context for network and device discovery
- vendor `updatedAt`, `lastUpdatedAt`, or `createdAt` as `observedAt` when present
- JCG receipt time as `collectedAt` otherwise

The service preserves vendor data and does not infer diagnoses or operational recommendations.

## Security considerations

Tests use injected fake transports and never call the Meraki API. Do not place API keys in source, package metadata, fixtures, logs, cache keys, or EvidenceRecords. Production composition should obtain credentials from an approved secure store and pass them through dependency injection.
