import {
  InventoryCapability,
  InventoryDevice,
  InventoryGraph,
  InventoryNetwork,
  InventoryOrganization,
  InventoryProductRole,
} from '../../core/inventory';
import { MerakiDevice, MerakiEvidenceResult, MerakiNetwork, MerakiOrganization } from './merakiTypes';

export interface MerakiInventoryInput {
  organization: MerakiEvidenceResult<MerakiOrganization[]>;
  networks: MerakiEvidenceResult<MerakiNetwork[]>;
  devices: MerakiEvidenceResult<MerakiDevice[]>;
}

export function buildMerakiInventory(input: MerakiInventoryInput): InventoryGraph {
  const organizationData = input.organization.data[0];
  if (!organizationData?.id || !organizationData.name) {
    throw new Error('Meraki inventory requires an organization record');
  }

  const organizationEvidenceIds = [input.organization.evidence.id];
  const organization: InventoryOrganization = {
    id: organizationData.id,
    vendor: 'Cisco Meraki',
    name: organizationData.name,
    networkIds: unique(input.networks.data.map(network => network.id).filter(Boolean)),
    evidenceIds: organizationEvidenceIds,
  };

  const networks = uniqueById(input.networks.data.map(network => ({
    id: network.id,
    vendor: 'Cisco Meraki',
    organizationId: organization.id,
    name: network.name,
    deviceIds: unique(input.devices.data.filter(device => device.networkId === network.id).map(device => device.serial ?? device.name ?? '').filter(Boolean)),
    evidenceIds: [input.networks.evidence.id],
    address: stringValue(network, 'address'),
    latitude: numberValue(network, 'lat', 'latitude'),
    longitude: numberValue(network, 'lng', 'longitude'),
  })));

  const devices = uniqueById(input.devices.data.map(device => {
    const productType = classifyProductType(device.productType, device);
    return {
      id: device.serial ?? device.name ?? `${organization.id}:${device.mac ?? 'unknown'}`,
      vendor: 'Cisco Meraki',
      organizationId: organization.id,
      networkId: device.networkId,
      productType,
      capability: capabilityFor(productType),
      model: stringValue(device, 'model', 'modelName'),
      serial: device.serial,
      name: device.name,
      mac: stringValue(device, 'mac', 'macAddress'),
      managementIp: stringValue(device, 'lanIp', 'managementIp', 'ipAddress'),
      firmware: stringValue(device, 'firmware', 'firmwareVersion'),
      tags: stringArrayValue(device, 'tags'),
      address: stringValue(device, 'address'),
      latitude: numberValue(device, 'lat', 'latitude'),
      longitude: numberValue(device, 'lng', 'longitude'),
      status: stringValue(device, 'status', 'networkStatus'),
      evidenceIds: [input.devices.evidence.id],
    };
  }));

  networks.forEach(network => {
    network.deviceIds = unique(devices.filter(device => device.networkId === network.id).map(device => device.id));
  });
  organization.networkIds = unique(networks.map(network => network.id));
  return new InventoryGraph(organization, networks, devices);
}

function classifyProductType(value: string | undefined, device: MerakiDevice): InventoryProductRole {
  const raw = [value, stringValue(device, 'model', 'modelName')].filter(Boolean).join(' ').toLowerCase();
  if (raw.includes('wireless') || raw.includes('access point') || raw.startsWith('mr')) return 'wireless';
  if (raw.includes('switch') || raw.startsWith('ms')) return 'switch';
  if (raw.includes('appliance') || raw.startsWith('mx') || raw.startsWith('z')) return 'appliance';
  if (raw.includes('cellular') || raw.includes('gateway') || raw.startsWith('mg')) return 'cellularGateway';
  if (raw.includes('sensor') || raw.startsWith('mt')) return 'sensor';
  if (raw.includes('camera') || raw.startsWith('mv')) return 'camera';
  return value as InventoryProductRole || 'unknown';
}

function capabilityFor(productType: InventoryProductRole): InventoryCapability {
  switch (productType) {
    case 'wireless': return 'RF / clients / connectivity';
    case 'switch': return 'ports / VLAN / STP / PoE';
    case 'appliance': return 'routing / security / SD-WAN / VPN';
    case 'cellularGateway': return 'WAN / cellular';
    case 'sensor': return 'environment';
    case 'camera': return 'video';
    default: return 'unknown';
  }
}

function stringValue(value: object, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function stringArrayValue(value: object, key: string): string[] {
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) ? candidate.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : [];
}

function numberValue(value: object, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (!value.id || seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}
