import * as assert from 'assert';
import { createEvidence } from '../src/core/evidence';
import { buildInventoryIndexes, InventoryGraph } from '../src/core/inventory';
import { buildMerakiInventory } from '../src/integrations/meraki/merakiInventoryService';

function evidence(name: string) {
  return createEvidence({
    type: 'VENDOR_REPORTED',
    name,
    value: [],
    source: { name: 'Cisco Meraki Dashboard API', vendor: 'Cisco Meraki', collector: 'merakiEvidenceService' },
  });
}

describe('Meraki inventory normalization', () => {
  it('normalizes relationships, optional fields, evidence links, and capabilities', () => {
    const organizationEvidence = evidence('meraki.organizations');
    const networkEvidence = evidence('meraki.organizations.networks');
    const deviceEvidence = evidence('meraki.organizations.devices');
    const graph = buildMerakiInventory({
      organization: {
        data: [{ id: 'org-1', name: 'LVMH BeautyTech AMER' }], evidence: organizationEvidence,
        cache: { cacheHit: false, cacheKey: 'organizations' }, response: { status: 200, headers: {} },
      },
      networks: {
        data: [{ id: 'net-1', name: 'Beauty Lab', address: '1 Main St', lat: 40.1, lng: -73.2 }], evidence: networkEvidence,
        cache: { cacheHit: false, cacheKey: 'networks' }, response: { status: 200, headers: {} },
      },
      devices: {
        data: [
          { serial: 'serial-1', name: 'AP-1', networkId: 'net-1', productType: 'wireless', model: 'MR46', mac: 'AA:BB', lanIp: '10.0.0.1', tags: ['retail', 'floor-1'] },
          { serial: 'serial-2', name: 'SW-1', networkId: 'net-1', productType: 'switch', model: 'MS250' },
          { serial: 'serial-3', name: 'MX-1', networkId: 'net-1', productType: 'appliance', model: 'MX85' },
          { serial: 'serial-4', name: 'MG-1', networkId: 'net-1', productType: 'cellularGateway', model: 'MG51' },
          { serial: 'serial-5', name: 'MT-1', networkId: 'net-1', productType: 'sensor' },
          { serial: 'serial-6', name: 'MV-1', networkId: 'net-1', productType: 'camera' },
          { serial: 'serial-7', name: 'Optional fields omitted', networkId: 'net-1' },
        ], evidence: deviceEvidence,
        cache: { cacheHit: false, cacheKey: 'devices' }, response: { status: 200, headers: {} },
      },
    });

    assert.strictEqual(graph.organization.name, 'LVMH BeautyTech AMER');
    assert.strictEqual(graph.networks.length, 1);
    assert.strictEqual(graph.devices.length, 7);
    assert.deepStrictEqual(graph.devices[0].evidenceIds, [deviceEvidence.id]);
    assert.strictEqual(graph.devices[0].managementIp, '10.0.0.1');
    assert.deepStrictEqual(graph.devices[0].tags, ['retail', 'floor-1']);
    assert.strictEqual(graph.devices[6].model, undefined);
    assert.strictEqual(graph.devices[6].capability, 'unknown');
    assert.strictEqual(graph.devices[0].capability, 'RF / clients / connectivity');
    assert.strictEqual(graph.devices[1].capability, 'ports / VLAN / STP / PoE');
    assert.strictEqual(graph.devices[2].capability, 'routing / security / SD-WAN / VPN');
    assert.strictEqual(graph.devices[3].capability, 'WAN / cellular');
    assert.strictEqual(graph.devices[4].capability, 'environment');
    assert.strictEqual(graph.devices[5].capability, 'video');
    assert.deepStrictEqual(graph.validate(), { duplicateDeviceCheck: true, relationshipCheck: true, indexCheck: true });
  });

  it('prevents duplicate devices and supports fast lookups', () => {
    const networks = [{ id: 'net-1', vendor: 'Cisco Meraki', organizationId: 'org-1', name: 'Network', deviceIds: [] , evidenceIds: [] }];
    const first = { id: 'device-1', vendor: 'Cisco Meraki', organizationId: 'org-1', productType: 'wireless' as const, capability: 'RF / clients / connectivity' as const, serial: 'SERIAL-1', name: 'AP-1', mac: 'AA:BB', model: 'MR46', tags: ['Retail'], networkId: 'net-1', evidenceIds: [] };
    const duplicate = { ...first };
    const graph = new InventoryGraph({ id: 'org-1', vendor: 'Cisco Meraki', name: 'Org', networkIds: ['net-1'], evidenceIds: [] }, networks, [first, duplicate]);
    const indexes = buildInventoryIndexes(networks, [first]);

    assert.strictEqual(indexes.byDeviceSerial.get('serial-1'), first);
    assert.strictEqual(indexes.byMac.get('aa:bb'), first);
    assert.deepStrictEqual(indexes.byDeviceName.get('ap-1'), [first]);
    assert.deepStrictEqual(indexes.byProductType.get('wireless'), [first]);
    assert.deepStrictEqual(indexes.byModel.get('mr46'), [first]);
    assert.deepStrictEqual(indexes.byTag.get('retail'), [first]);
    assert.strictEqual(graph.validate().duplicateDeviceCheck, false);
  });
});
