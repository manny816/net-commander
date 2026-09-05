import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  __getRfProbeStateForTest,
  __parseSystemProfilerForTest,
} from '../src/modules/macosWifiEvidence';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, '..', '..', 'test', 'fixtures', 'macos', name), 'utf8');
}

describe('macOS Wi-Fi evidence parser', () => {
  it('parses a redacted 6 GHz current link', () => {
    const parsed = __parseSystemProfilerForTest(fixture('wifi-6ghz-redacted.txt'));

    assert.strictEqual(parsed.mode, '802.11ax');
    assert.strictEqual(parsed.band, '6 GHz');
    assert.strictEqual(parsed.channel, 53);
    assert.strictEqual(parsed.widthMHz, 160);
    assert.strictEqual(parsed.signalDbm, -44);
    assert.strictEqual(parsed.noiseDbm, -89);
    assert.strictEqual(parsed.snrDb, 45);
    assert.strictEqual(parsed.mcsIndex, 9);
    assert.strictEqual(parsed.txRateMbps, 2401);
  });

  it('parses multiband neighbors and names redacted radios anonymously', () => {
    const parsed = __parseSystemProfilerForTest(fixture('wifi-multiband-redacted.txt'));
    const neighbors = parsed.neighborDetails ?? [];

    assert.strictEqual(neighbors.length, 3);
    assert.deepStrictEqual(neighbors.map(neighbor => neighbor.ssid), [
      'Anonymous radio 1',
      'Anonymous radio 2',
      'Anonymous radio 3',
    ]);
    assert.deepStrictEqual(neighbors.map(neighbor => neighbor.band), [
      '2.4 GHz',
      '5 GHz',
      '6 GHz',
    ]);
    assert.deepStrictEqual(neighbors.map(neighbor => neighbor.widthMHz), [20, 80, 160]);
    assert.deepStrictEqual(neighbors.map(neighbor => neighbor.security), [
      'WPA2 Personal',
      'WPA3 Personal',
      'WPA3 Personal',
    ]);
    assert.deepStrictEqual(neighbors.map(neighbor => neighbor.mode), [
      '802.11n',
      '802.11ac',
      '802.11ax',
    ]);
    assert.ok(neighbors.every(neighbor => neighbor.bssid === undefined));
  });

  it('does not fabricate missing neighbor signal or noise', () => {
    const parsed = __parseSystemProfilerForTest(fixture('wifi-multiband-redacted.txt'));
    const neighbors = parsed.neighborDetails ?? [];

    assert.ok(neighbors.every(neighbor => neighbor.signalDbm === undefined));
    assert.ok(neighbors.every(neighbor => neighbor.noiseDbm === undefined));
    assert.ok(neighbors.every(neighbor => neighbor.strength === 0));
  });

  it('handles a current link with no observed neighbors', () => {
    const parsed = __parseSystemProfilerForTest(fixture('wifi-no-neighbors.txt'));

    assert.deepStrictEqual(parsed.neighborDetails, []);
    assert.deepStrictEqual(parsed.neighborSSIDs, []);
    assert.deepStrictEqual(parsed.neighborBars, []);
  });

  it('preserves the collector probe states', () => {
    assert.strictEqual(__getRfProbeStateForTest(true, 0, 1000, false), 'pending');
    assert.strictEqual(__getRfProbeStateForTest(false, 1000, 2000, false), 'fresh');
    assert.strictEqual(__getRfProbeStateForTest(false, 1000, 7001, false), 'cached');
    assert.strictEqual(__getRfProbeStateForTest(false, 0, 1000, true), 'failed');
  });
});

