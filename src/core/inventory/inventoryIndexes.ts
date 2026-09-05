import { InventoryDevice, InventoryNetwork } from './inventoryTypes';

export interface InventoryIndexes {
  byNetworkId: Map<string, InventoryNetwork>;
  byDeviceSerial: Map<string, InventoryDevice>;
  byDeviceName: Map<string, InventoryDevice[]>;
  byMac: Map<string, InventoryDevice>;
  byProductType: Map<string, InventoryDevice[]>;
  byModel: Map<string, InventoryDevice[]>;
  byTag: Map<string, InventoryDevice[]>;
}

export function buildInventoryIndexes(
  networks: InventoryNetwork[],
  devices: InventoryDevice[]
): InventoryIndexes {
  const indexes: InventoryIndexes = {
    byNetworkId: new Map(),
    byDeviceSerial: new Map(),
    byDeviceName: new Map(),
    byMac: new Map(),
    byProductType: new Map(),
    byModel: new Map(),
    byTag: new Map(),
  };

  networks.forEach(network => indexes.byNetworkId.set(network.id, network));
  devices.forEach(device => {
    if (device.serial) indexes.byDeviceSerial.set(device.serial.toLowerCase(), device);
    if (device.mac) indexes.byMac.set(device.mac.toLowerCase(), device);
    add(indexes.byDeviceName, device.name, device);
    add(indexes.byProductType, device.productType, device);
    add(indexes.byModel, device.model, device);
    device.tags.forEach(tag => add(indexes.byTag, tag, device));
  });

  return indexes;
}

function add<T>(index: Map<string, T[]>, value: string | undefined, item: T): void {
  if (!value) return;
  const key = value.toLowerCase();
  const items = index.get(key) ?? [];
  if (!items.includes(item)) items.push(item);
  index.set(key, items);
}
