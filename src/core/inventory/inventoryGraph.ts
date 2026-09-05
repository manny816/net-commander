import { InventoryDevice, InventoryNetwork, InventoryOrganization } from './inventoryTypes';
import { buildInventoryIndexes, InventoryIndexes } from './inventoryIndexes';

export interface InventoryValidation {
  duplicateDeviceCheck: boolean;
  relationshipCheck: boolean;
  indexCheck: boolean;
}

export class InventoryGraph {
  readonly indexes: InventoryIndexes;

  constructor(
    readonly organization: InventoryOrganization,
    readonly networks: InventoryNetwork[],
    readonly devices: InventoryDevice[],
  ) {
    this.indexes = buildInventoryIndexes(networks, devices);
  }

  validate(): InventoryValidation {
    const deviceIds = new Set<string>();
    const duplicateDeviceCheck = this.devices.every(device => {
      if (deviceIds.has(device.id)) return false;
      deviceIds.add(device.id);
      return true;
    });
    const networkIds = new Set(this.networks.map(network => network.id));
    const relationshipCheck = this.organization.networkIds.every(networkId => networkIds.has(networkId)) &&
      this.networks.every(network => network.organizationId === this.organization.id &&
        network.deviceIds.every(deviceId => this.devices.some(device => device.id === deviceId))) &&
      this.devices.every(device => !device.networkId || networkIds.has(device.networkId));
    const indexCheck = this.devices.every(device =>
      (!device.serial || this.indexes.byDeviceSerial.get(device.serial.toLowerCase()) === device) &&
      (!device.mac || this.indexes.byMac.get(device.mac.toLowerCase()) === device)
    ) && this.networks.every(network => this.indexes.byNetworkId.get(network.id) === network);

    return { duplicateDeviceCheck, relationshipCheck, indexCheck };
  }
}
