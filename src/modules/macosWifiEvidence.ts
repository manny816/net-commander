import { promisify } from 'util';
import { exec as execCb } from 'child_process';

const exec = promisify(execCb);
const RF_CACHE_MS = 5000;

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
}

let cachedAt = 0;
let cachedRf: Partial<MacOSWiFiEvidence> = {};
let rfInFlight: Promise<Partial<MacOSWiFiEvidence>> | undefined;

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

function parseSystemProfiler(output: string): Partial<MacOSWiFiEvidence> {
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
  };
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

async function refreshRfEvidence(): Promise<Partial<MacOSWiFiEvidence>> {
  try {
    const { stdout } = await exec('/usr/sbin/system_profiler SPAirPortDataType');
    cachedRf = parseSystemProfiler(stdout);
    cachedAt = Date.now();
    return cachedRf;
  } catch {
    return cachedRf;
  } finally {
    rfInFlight = undefined;
  }
}

async function getRfEvidence(): Promise<Partial<MacOSWiFiEvidence>> {
  const now = Date.now();
  if (now - cachedAt < RF_CACHE_MS && Object.keys(cachedRf).length) return cachedRf;

  if (!rfInFlight) {
    rfInFlight = refreshRfEvidence();
  }

  return rfInFlight;
}

export async function gatherMacOSWiFiEvidence(): Promise<MacOSWiFiEvidence> {
  const adapter = await getWiFiInterface();
  const [ipAddr, ssid, rf] = await Promise.all([
    getIPv4(adapter.iface),
    getSSID(adapter.iface),
    getRfEvidence(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    ...adapter,
    ipAddr,
    ssid,
    ...rf,
    linkQuality: rf.snrDb != null ? `SNR ${rf.snrDb} dB` : undefined,
  };
}
