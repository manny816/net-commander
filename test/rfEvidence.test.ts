import * as assert from 'assert';

import { buildRfEvidence } from '../src/core/evidence/rfEvidence';

const sample = {
  timestamp: '2026-09-05T12:00:00.000Z',
  iface: 'en0',
  signalDbm: -44,
  noiseDbm: -89,
  snrDb: 45,
  channel: 53,
  widthMHz: 160,
  band: '6 GHz',
  mode: '802.11ax',
  mcsIndex: 9,
  txRateMbps: 2401,
  rfProbeState: 'cached' as const,
  rfProbeAgeMs: 7400,
  neighborDetails: [],
};

describe('RF Evidence Schema conversion', () => {
  const records = buildRfEvidence(sample);
  const byName = new Map(records.map(record => [record.name, record]));

  it('creates the expected RF evidence records', () => {
    for (const name of [
      'wifi.rssi',
      'wifi.noiseFloor',
      'wifi.snr',
      'wifi.channel',
      'wifi.channelWidth',
      'wifi.band',
      'wifi.phyMode',
      'wifi.mcsIndex',
      'wifi.txPhyRate',
      'wifi.observedRadios',
    ]) {
      assert.ok(byName.get(name), `missing ${name}`);
    }
  });

  it('assigns measurement and derived evidence types', () => {
    assert.strictEqual(byName.get('wifi.rssi')?.type, 'MEASURED');
    assert.strictEqual(byName.get('wifi.noiseFloor')?.type, 'MEASURED');
    assert.strictEqual(byName.get('wifi.snr')?.type, 'DERIVED');
  });

  it('preserves exact RSSI and noise IDs as SNR lineage', () => {
    const rssi = byName.get('wifi.rssi');
    const noise = byName.get('wifi.noiseFloor');
    const snr = byName.get('wifi.snr');

    assert.ok(rssi && noise && snr);
    assert.deepStrictEqual(snr.derivedFrom, [rssi.id, noise.id]);
  });

  it('preserves RF age and timestamps', () => {
    for (const record of records) {
      assert.strictEqual(record.freshnessMs, 7400);
      assert.ok(Date.parse(record.observedAt) < Date.parse(record.collectedAt));
    }
  });

  it('assigns full confidence to direct RF measurements', () => {
    for (const name of [
      'wifi.rssi',
      'wifi.noiseFloor',
      'wifi.channel',
      'wifi.channelWidth',
      'wifi.band',
      'wifi.phyMode',
      'wifi.mcsIndex',
      'wifi.txPhyRate',
      'wifi.observedRadios',
    ]) {
      assert.strictEqual(byName.get(name)?.confidence, 100, name);
    }
  });
});
