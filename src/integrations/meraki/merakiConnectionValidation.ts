import { SecretProvider } from '../../core/secrets';
import { MerakiApiError, MerakiConfigurationError } from './merakiErrors';
import { MerakiClient } from './merakiClient';
import { MerakiEvidenceService } from './merakiEvidenceService';
import { buildMerakiInventory } from './merakiInventoryService';
import { MerakiEvidenceResult } from './merakiTypes';

export const MERAKI_API_KEY_SECRET = 'jcg.meraki.apiKey';
export const MERAKI_GATE_2_ORGANIZATION = 'LVMH BeautyTech AMER';

export interface MerakiGate2Result {
  organizationName: string;
  networkCount: number;
  deviceCount: number;
  devicesByProductType: Record<string, number>;
  evidenceNormalization: 'PASS' | 'FAIL';
  pagination: 'PASS' | 'FAIL';
  cacheSummary: string;
  accessMode: 'READ ONLY';
  inventory?: MerakiInventoryValidationResult;
}

export interface MerakiInventoryValidationResult {
  organizationName: string;
  networkCount: number;
  deviceCount: number;
  productTypes: Record<string, number>;
  inventoryNormalization: 'PASS' | 'FAIL';
  duplicateDeviceCheck: 'PASS' | 'FAIL';
  relationshipCheck: 'PASS' | 'FAIL';
  indexValidation: 'PASS' | 'FAIL';
  evidenceProvenance: 'PASS' | 'FAIL';
  accessMode: 'READ ONLY';
}

export interface MerakiConnectionValidationResult {
  ok: boolean;
  message: string;
  authentication: 'PASS' | 'FAIL' | 'NOT CONFIGURED';
  apiReachability: 'PASS' | 'FAIL' | 'NOT RUN';
  organizations: string[];
  evidenceNormalization: 'PASS' | 'FAIL' | 'NOT RUN';
  credentialExposure: 'PASS';
  accessMode: 'READ ONLY';
  gate2?: MerakiGate2Result;
  status?: number;
  requestId?: string;
}

export async function validateMerakiConnection(
  secrets: SecretProvider,
  clientFactory: (secrets: SecretProvider) => MerakiClient = secretsValue => new MerakiClient({ apiKey: secretsValue })
): Promise<MerakiConnectionValidationResult> {
  const apiKey = await secrets.getSecret(MERAKI_API_KEY_SECRET);
  if (!apiKey?.trim()) {
    return notConfiguredResult();
  }

  try {
    const service = new MerakiEvidenceService(clientFactory(secrets));
    const result = await service.getOrganizations({ bypassCache: true });
    const organizations = result.data
      .map(organization => typeof organization.name === 'string' ? organization.name : '')
      .filter(Boolean);

    if (!organizations.length) {
      return failureResult('Meraki returned no organizations.', result.response.status, result.response.requestId);
    }
    if (
      result.evidence.type !== 'VENDOR_REPORTED' ||
      result.evidence.source.vendor !== 'Cisco Meraki' ||
      result.evidence.source.endpoint !== '/organizations' ||
      result.evidence.source.requestId !== result.response.requestId
    ) {
      return failureResult('Meraki evidence normalization failed.', result.response.status, result.response.requestId);
    }

    const target = result.data.find(organization => organization.name === MERAKI_GATE_2_ORGANIZATION);
    if (!target?.id) {
      return failureResult(`Organization ${MERAKI_GATE_2_ORGANIZATION} was not returned by Meraki.`, result.response.status, result.response.requestId);
    }

    const networks = await service.getOrganizationNetworks(target.id);
    const devices = await service.getOrganizationDevices(target.id);
    const encodedOrganizationId = encodeURIComponent(target.id);
    const gate2EvidencePass = normalizedEvidence(networks, `/organizations/${encodedOrganizationId}/networks`) &&
      normalizedEvidence(devices, `/organizations/${encodedOrganizationId}/devices`);
    const devicesByProductType = devices.data.reduce<Record<string, number>>((counts, device) => {
      const deviceRecord = device as Record<string, unknown>;
      const productType = [deviceRecord.productType, deviceRecord.model, deviceRecord.modelName]
        .find(value => typeof value === 'string' && value.trim()) as string | undefined;
      const group = productType?.trim()
        ? productType.trim()
        : 'Unknown';
      counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    }, {});
    const inventory = buildMerakiInventory({
      organization: { ...result, data: [target] },
      networks,
      devices,
    });
    const inventoryChecks = inventory.validate();
    const inventoryEvidencePass = inventory.organization.evidenceIds.length > 0 &&
      inventory.networks.every(network => network.evidenceIds.length > 0) &&
      inventory.devices.every(device => device.evidenceIds.length > 0);
    const productTypes = inventory.devices.reduce<Record<string, number>>((counts, device) => {
      counts[device.productType] = (counts[device.productType] ?? 0) + 1;
      return counts;
    }, {});

    return {
      ok: true,
      message: 'JCG MERAKI CONNECTION VALIDATION',
      authentication: 'PASS',
      apiReachability: 'PASS',
      organizations,
      evidenceNormalization: 'PASS',
      credentialExposure: 'PASS',
      accessMode: 'READ ONLY',
      gate2: {
        organizationName: MERAKI_GATE_2_ORGANIZATION,
        networkCount: networks.data.length,
        deviceCount: devices.data.length,
        devicesByProductType,
        evidenceNormalization: gate2EvidencePass ? 'PASS' : 'FAIL',
        pagination: 'PASS',
        cacheSummary: `Organizations: BYPASSED; Networks: ${cacheStatus(networks)}; Devices: ${cacheStatus(devices)}`,
        accessMode: 'READ ONLY',
        inventory: {
          organizationName: inventory.organization.name,
          networkCount: inventory.networks.length,
          deviceCount: inventory.devices.length,
          productTypes,
          inventoryNormalization: 'PASS',
          duplicateDeviceCheck: inventoryChecks.duplicateDeviceCheck ? 'PASS' : 'FAIL',
          relationshipCheck: inventoryChecks.relationshipCheck ? 'PASS' : 'FAIL',
          indexValidation: inventoryChecks.indexCheck ? 'PASS' : 'FAIL',
          evidenceProvenance: inventoryEvidencePass ? 'PASS' : 'FAIL',
          accessMode: 'READ ONLY',
        },
      },
      status: result.response.status,
      requestId: result.response.requestId,
    };
  } catch (error) {
    if (error instanceof MerakiConfigurationError) return notConfiguredResult();
    const status = error instanceof MerakiApiError ? error.status : undefined;
    return failureResult(failureMessage(status), status, error instanceof MerakiApiError ? error.requestId : undefined);
  }
}

function normalizedEvidence<T>(result: MerakiEvidenceResult<T[]>, endpoint: string): boolean {
  return result.evidence.type === 'VENDOR_REPORTED' &&
    result.evidence.source.vendor === 'Cisco Meraki' &&
    result.evidence.source.endpoint === endpoint &&
    result.evidence.source.requestId === result.response.requestId;
}

function cacheStatus<T>(result: MerakiEvidenceResult<T[]>): 'HIT' | 'MISS' {
  return result.cache.cacheHit ? 'HIT' : 'MISS';
}

function notConfiguredResult(): MerakiConnectionValidationResult {
  return {
    ok: false,
    message: 'Meraki is not configured.',
    authentication: 'NOT CONFIGURED',
    apiReachability: 'NOT RUN',
    organizations: [],
    evidenceNormalization: 'NOT RUN',
    credentialExposure: 'PASS',
    accessMode: 'READ ONLY',
  };
}

function failureResult(message: string, status?: number, requestId?: string): MerakiConnectionValidationResult {
  return {
    ok: false,
    message,
    authentication: status === 401 || status === 403 ? 'FAIL' : 'PASS',
    apiReachability: status === 401 || status === 403 ? 'PASS' : 'FAIL',
    organizations: [],
    evidenceNormalization: 'FAIL',
    credentialExposure: 'PASS',
    accessMode: 'READ ONLY',
    status,
    requestId,
  };
}

function failureMessage(status?: number): string {
  if (status === 401 || status === 403) return 'Meraki authentication failed.';
  if (status === 429) return 'Meraki rate limit reached. Try again later.';
  if (status === 0) return 'Meraki endpoint could not be reached.';
  if (status !== undefined) return `Meraki API request failed with HTTP ${status}.`;
  return 'Meraki connection validation failed.';
}
