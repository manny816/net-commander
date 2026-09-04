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
  channel?: number;
  widthMHz?: number;
  signalDbm?: number;
  noiseDbm?: number;
  txRateMbps?: number;
  linkQuality?: string;
  timestamp: string;
}

let cachedAt = 0;
let cachedRf: Partial<MacOSWiFiEvidence> = {};

function capture(output: string, re: RegExp): string | undefined {
  const match = output.match(re);
  return match?.[1]?.trim();
}

function parseChannel(value?: string): { channel?: number; widthMHz?: number } {
  if (!value) return {};
  const match = value.match(/(\d+)\s*\([^,]+,\s*(\d+)MHz\)/i);
  if (!match) {
    const channel = Number(value.match(/\d+/)?.[0]);
    return Number.isFinite(channel) ? { channel } : {};
  }
  return { channel: Number(match[1]), widthMHz: Number(match[2]) };
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

  return {
    mode,
    ...channelInfo,
    signalDbm: signalNoise ? Number(signalNoise[1]) : undefined,
    noiseDbm: signalNoise ? Number(signalNoise[2]) : undefined,
    txRateMbps: Number.isFinite(txRate) ? txRate : undefined,
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

async function getRfEvidence(): Promise<Partial<MacOSWiFiEvidence>> {
  const now = Date.now();
  if (now - cachedAt < RF_CACHE_MS && Object.keys(cachedRf).length) return cachedRf;

  try {
    const { stdout } = await exec('/usr/sbin/system_profiler SPAirPortDataType');
    cachedRf = parseSystemProfiler(stdout);
    cachedAt = now;
    return cachedRf;
  } catch {
    return cachedRf;
  }
}

export async function gatherMacOSWiFiEvidence(): Promise<MacOSWiFiEvidence> {
  const adapter = await getWiFiInterface();
  const [ipAddr, ssid, rf] = await Promise.all([
    getIPv4(adapter.iface),
    getSSID(adapter.iface),
    getRfEvidence(),
  ]);

  const signalDbm = rf.signalDbm;
  const noiseDbm = rf.noiseDbm;
  const snr = signalDbm != null && noiseDbm != null ? signalDbm - noiseDbm : undefined;

  return {
    timestamp: new Date().toISOString(),
    ...adapter,
    ipAddr,
    ssid,
    ...rf,
    linkQuality: snr != null ? `SNR ${snr} dB` : undefined,
  };
}
