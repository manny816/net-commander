import { promisify } from 'util';
import { exec as execCb } from 'child_process';

const exec = promisify(execCb);
const RF_CACHE_MS = 5000;
const RF_TIMEOUT_MS = 20000;

export interface MacOSNeighborEvidence {
  ssid: string;
  bssid?: string;
  channel: number;
  strength: number;
  signalDbm?: number;
  noiseDbm?: number;
  band?: string;
  widthMHz?: number;
  mode?: string;
  security?: string;
}

export interface MacOSWiFiEvidence {
  iface?: string;
  mac?: string;
  ipAddr?: string;
  ssid?: string;
  bssid?: string;
  mode?: string;
  band?: string;
  channel?: number;
  widthMHz?: number;
  signalDbm?: number;
  noiseDbm?: number;
  snrDb?: number;
  txRateMbps?: number;
  mcsIndex?: number;
  security?: string;
  networkType?: string;
  linkQuality?: string;
  timestamp: string;
  neighborDetails?: MacOSNeighborEvidence[];
  neighborBars?: { channel: number; strength: number }[];
  neighborSSIDs?: string[];
  rfProbeState?: 'fresh' | 'cached' | 'pending' | 'failed';
  rfProbeAgeMs?: number;
}

let cachedAt = 0;
let cachedRf: Partial<MacOSWiFiEvidence> = {};
let rfInFlight: Promise<void> | undefined;
let lastProbeFailed = false;

function capture(output: string, re: RegExp): string | undefined {
  const match = output.match(re);
  return match?.[1]?.trim();
}

function parseChannel(value?: string): { channel?: number; band?: string; widthMHz?: number } {
  if (!value) return {};

  const match = value.match(/(\d+)\s*\(([^,]+),\s*(\d+)MHz\)/i);
  if (!match) {
    const channel = Number(value.match(/\d+/)?.[0]);
    return Number.isFinite(channel) ? { channel } : {};
  }

  const rawBand = match[2].trim();
  const band = rawBand
    .replace(/2GHz/i, '2.4 GHz')
    .replace(/5GHz/i, '5 GHz')
    .replace(/6GHz/i, '6 GHz');

  return {
    channel: Number(match[1]),
    band,
    widthMHz: Number(match[3]),
  };
}

function dbmToPercent(rssi?: number): number {
  if (!Number.isFinite(rssi)) return 0;
  return Math.max(0, Math.min(100, Math.round((((rssi as number) + 100) / 70) * 100)));
}

function parseNeighborNetworks(output: string, otherStart: number): MacOSNeighborEvidence[] {
  if (otherStart < 0) return [];

  const tail = output.slice(otherStart + 'Other Local Wi-Fi Networks:'.length);
  const awdlStart = tail.search(/^\s*awdl0:\s*$/m);
  const section = awdlStart >= 0 ? tail.slice(0, awdlStart) : tail;
  const lines = section.split(/\r?\n/);
  const neighbors: MacOSNeighborEvidence[] = [];

  let label: string | undefined;
  let body: string[] = [];

  const flush = () => {
    if (!body.length) {
      label = undefined;
      return;
    }

    const block = body.join('\n');
    const channelInfo = parseChannel(capture(block, /^\s*Channel:\s*(.+)$/im));
    if (!Number.isFinite(channelInfo.channel)) {
      label = undefined;
      body = [];
      return;
    }

    const signalNoise = block.match(/Signal \/ Noise:\s*(-?\d+) dBm \/ (-?\d+) dBm/i);
    const signalDbm = signalNoise ? Number(signalNoise[1]) : undefined;
    const noiseDbm = signalNoise ? Number(signalNoise[2]) : undefined;
    const bssid = capture(block, /^\s*BSSID:\s*([0-9a-f:]{17})\s*$/im);
    const safeLabel = !label || label === '<redacted>'
      ? `Anonymous radio ${neighbors.length + 1}`
      : label;

    neighbors.push({
      ssid: safeLabel,
      bssid,
      channel: channelInfo.channel as number,
      strength: dbmToPercent(signalDbm),
      signalDbm,
      noiseDbm,
      band: channelInfo.band,
      widthMHz: channelInfo.widthMHz,
      mode: capture(block, /^\s*PHY Mode:\s*(.+)$/im),
      security: capture(block, /^\s*Security:\s*(.+)$/im),
    });

    label = undefined;
    body = [];
  };

  for (const line of lines) {
    const header = line.match(/^\s+(.+):\s*$/);
    if (header) {
      flush();
      label = header[1].trim();
      body = [];
      continue;
    }

    if (/^\s*PHY Mode:\s*/i.test(line) && body.some(existing => /^\s*PHY Mode:\s*/i.test(existing))) {
      flush();
    }

    if (/^\s*PHY Mode:\s*/i.test(line) && !label) {
      label = '<redacted>';
    }

    if (label || body.length) {
      body.push(line);
    }
  }
  flush();

  return neighbors;
}

export function __parseSystemProfilerForTest(output: string): Partial<MacOSWiFiEvidence> {
  const currentStart = output.indexOf('Current Network Information:');
  if (currentStart < 0) return {};

  const otherStart = output.indexOf('Other Local Wi-Fi Networks:', currentStart);
  const current = output.slice(currentStart, otherStart > currentStart ? otherStart : undefined);

  const signalNoise = current.match(/Signal \/ Noise:\s*(-?\d+) dBm \/ (-?\d+) dBm/i);
  const channelInfo = parseChannel(capture(current, /Channel:\s*(.+)/i));
  const mode = capture(current, /PHY Mode:\s*(.+)/i);
  const txRate = Number(capture(current, /Transmit Rate:\s*([\d.]+)/i));
  const mcs = Number(capture(current, /MCS Index:\s*(\d+)/i));
  const security = capture(current, /Security:\s*(.+)/i);
  const networkType = capture(current, /Network Type:\s*(.+)/i);
  const signalDbm = signalNoise ? Number(signalNoise[1]) : undefined;
  const noiseDbm = signalNoise ? Number(signalNoise[2]) : undefined;
  const snrDb = signalDbm != null && noiseDbm != null ? signalDbm - noiseDbm : undefined;
  const neighborDetails = parseNeighborNetworks(output, otherStart);

  const bestByChannel = new Map<number, number>();
  for (const neighbor of neighborDetails) {
    const previous = bestByChannel.get(neighbor.channel) ?? 0;
    bestByChannel.set(neighbor.channel, Math.max(previous, neighbor.strength));
  }

  return {
    mode,
    ...channelInfo,
    signalDbm,
    noiseDbm,
    snrDb,
    txRateMbps: Number.isFinite(txRate) ? txRate : undefined,
    mcsIndex: Number.isFinite(mcs) ? mcs : undefined,
    security,
    networkType,
    neighborDetails,
    neighborBars: Array.from(bestByChannel, ([channel, strength]) => ({ channel, strength }))
      .sort((a, b) => a.channel - b.channel),
    neighborSSIDs: neighborDetails.map(n => n.ssid),
  };
}

function parseSystemProfiler(output: string): Partial<MacOSWiFiEvidence> {
  return __parseSystemProfilerForTest(output);
}

export function __getRfProbeStateForTest(
  rfInFlight: boolean,
  cachedAt: number,
  now: number,
  lastProbeFailed: boolean
): MacOSWiFiEvidence['rfProbeState'] {
  const age = cachedAt ? now - cachedAt : undefined;
  if (rfInFlight && !cachedAt) return 'pending';
  if (lastProbeFailed && !cachedAt) return 'failed';
  if (cachedAt && age != null && age < RF_CACHE_MS) return 'fresh';
  if (cachedAt) return 'cached';
  return 'pending';
}

async function getWiFiInterface(): Promise<{ iface?: string; mac?: string }> {
  const { stdout } = await exec('/usr/sbin/networksetup -listallhardwareports');
  const block = stdout
    .split(/\n\s*\n/)
    .find(section => /^Hardware Port:\s*Wi-Fi\s*$/m.test(section));

  if (!block) return {};
  return {
    iface: capture(block, /^Device:\s*(.+)$/m),
    mac: capture(block, /^Ethernet Address:\s*(.+)$/m),
  };
}

async function getIPv4(iface?: string): Promise<string | undefined> {
  if (!iface) return undefined;
  try {
    const { stdout } = await exec(`/usr/sbin/ipconfig getifaddr ${iface}`);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function getSSID(iface?: string): Promise<string | undefined> {
  if (!iface) return undefined;
  try {
    const { stdout } = await exec(`/usr/sbin/networksetup -getairportnetwork ${iface}`);
    const match = stdout.match(/Current Wi-Fi Network:\s*(.+)$/i);
    const value = match?.[1]?.trim();
    return value && value !== '<redacted>' ? value : undefined;
  } catch {
    return undefined;
  }
}

async function getWdutilIdentity(): Promise<{ ssid?: string; bssid?: string }> {
  try {
    const { stdout, stderr } = await exec('/usr/bin/wdutil info', {
      timeout: 3000,
      maxBuffer: 1024 * 1024,
    });
    const text = `${stdout}\n${stderr}`;
    const ssid = capture(text, /^\s*SSID\s*:\s*(.+)$/im);
    const bssid = capture(text, /^\s*BSSID\s*:\s*([0-9a-f:]{17})\s*$/im);
    return {
      ssid: ssid && ssid !== '<redacted>' ? ssid : undefined,
      bssid,
    };
  } catch {
    return {};
  }
}

async function refreshRfEvidence(): Promise<void> {
  try {
    const { stdout } = await exec('/usr/sbin/system_profiler SPAirPortDataType', {
      timeout: RF_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = parseSystemProfiler(stdout);
    if (Object.keys(parsed).length) {
      cachedRf = parsed;
      cachedAt = Date.now();
      lastProbeFailed = false;
    }
  } catch {
    lastProbeFailed = true;
  } finally {
    rfInFlight = undefined;
  }
}

function getRfEvidence(): Partial<MacOSWiFiEvidence> {
  const now = Date.now();
  const stale = now - cachedAt >= RF_CACHE_MS || !Object.keys(cachedRf).length;

  if (stale && !rfInFlight) {
    rfInFlight = refreshRfEvidence();
  }

  const age = cachedAt ? now - cachedAt : undefined;
  const rfProbeState = __getRfProbeStateForTest(
    Boolean(rfInFlight),
    cachedAt,
    now,
    lastProbeFailed
  );

  return {
    ...cachedRf,
    rfProbeState,
    rfProbeAgeMs: age,
  };
}

export async function gatherMacOSWiFiEvidence(): Promise<MacOSWiFiEvidence> {
  const adapter = await getWiFiInterface();
  const [ipAddr, ssidFromNetworksetup, identity] = await Promise.all([
    getIPv4(adapter.iface),
    getSSID(adapter.iface),
    getWdutilIdentity(),
  ]);
  const rf = getRfEvidence();

  return {
    timestamp: new Date().toISOString(),
    ...adapter,
    ipAddr,
    ssid: identity.ssid ?? ssidFromNetworksetup,
    bssid: identity.bssid,
    ...rf,
    linkQuality: rf.snrDb != null ? `SNR ${rf.snrDb} dB` : undefined,
  };
}
