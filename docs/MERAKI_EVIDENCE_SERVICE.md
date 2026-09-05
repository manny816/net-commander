# Meraki Evidence Service

## Architecture

The Meraki integration lives under `src/integrations/meraki/`:

- `merakiClient.ts` provides authenticated, read-only Dashboard API access.
- `merakiEvidenceService.ts` provides TTL caching and EvidenceRecord normalization.
- `merakiTypes.ts` defines transport, response, cache, credential, and discovery types.
- `merakiErrors.ts` defines structured API, configuration, and pagination errors.
- `index.ts` provides the integration export surface.

The initial service exposes only organization, organization-network, and organization-device discovery.

## Gate 1 connection validation

The VS Code command `JCG Network TS: Validate Meraki Connection` performs the first live validation. It obtains the key through `SecretProvider`, constructs the existing client and evidence service, and calls exactly:

`GET https://api.meraki.com/api/v1/organizations`

It does not call network, device, client, configuration, firewall, telemetry, or mutation endpoints. The user-facing result reports authentication, reachability, organization count and names, evidence normalization, credential exposure status, and read-only access mode. Organization IDs are not displayed.

Gate 2 extends this same command for the organization `LVMH BeautyTech AMER`. After resolving its ID from the organization list, it calls only the organization networks and organization devices GET endpoints. The report includes network and device counts, device counts grouped by product type, evidence normalization, pagination, and cache status. Client, configuration, firewall, VPN, and telemetry endpoints remain out of scope. Organization IDs remain internal and are not displayed.

## SecretProvider abstraction

The core platform uses the platform-neutral `SecretProvider` contract in `src/core/secrets/`:

- `getSecret(key)` retrieves a secret.
- `setSecret(key, value)` stores a secret.
- `deleteSecret(key)` removes a secret.

The current VS Code adapter is `VscodeSecretProvider`, backed by `vscode.ExtensionContext.secrets`. The Meraki client receives this provider through dependency injection and does not import VS Code. Future adapters can target environment-backed development credentials, Vault, or cloud secret managers without changing the Meraki integration.

The Meraki key uses the secret identifier `jcg.meraki.apiKey`. It is never stored in normal VS Code settings or `settings.json`.

## Read-only guarantee

The client creates only `GET` requests. There are no POST, PUT, or DELETE methods. The service does not expose configuration mutation endpoints.

## Authentication model

A caller injects an API key string, a credential provider, or an object implementing `getApiKey()`. The integration does not choose where credentials are stored. API keys are sent only in the `X-Cisco-Meraki-API-Key` request header and are never logged, included in cache keys, or stored in EvidenceRecords.

The VS Code `SecretStorage` adapter is composed at the extension boundary without changing the client or service contracts.

The VS Code commands are:

- `JCG Network TS: Configure Meraki API Key`
- `JCG Network TS: Remove Meraki API Key`
- `JCG Network TS: Check Meraki API Configuration`

Configuration prompts are password-masked, trim whitespace, reject empty input, and report only success. Removal requires confirmation. Configuration checks report only `Configured` or `Not configured`; they do not reveal key length, prefix, suffix, hash, or fingerprints.

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

Tests use injected fake transports and fake secret providers and never call the Meraki API. Do not place API keys in source, package metadata, fixtures, logs, cache keys, structured errors, or EvidenceRecords. Production composition obtains credentials from VS Code SecretStorage today and can later use an approved secure store through the same abstraction.
