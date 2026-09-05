export type InventoryProductRole =
  | 'wireless'
  | 'switch'
  | 'appliance'
  | 'cellularGateway'
  | 'sensor'
  | 'camera'
  | 'unknown';

export type InventoryCapability =
  | 'RF / clients / connectivity'
  | 'ports / VLAN / STP / PoE'
  | 'routing / security / SD-WAN / VPN'
  | 'WAN / cellular'
  | 'environment'
  | 'video'
  | 'unknown';

export interface InventoryOrganization {
  id: string;
  vendor: string;
  name: string;
  networkIds: string[];
  evidenceIds: string[];
}

export interface InventoryNetwork {
  id: string;
  vendor: string;
  organizationId: string;
  name: string;
  deviceIds: string[];
  evidenceIds: string[];
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface InventoryDevice {
  id: string;
  vendor: string;
  organizationId: string;
  networkId?: string;
  productType: InventoryProductRole;
  capability: InventoryCapability;
  model?: string;
  serial?: string;
  name?: string;
  mac?: string;
  managementIp?: string;
  firmware?: string;
  tags: string[];
  address?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  evidenceIds: string[];
}
