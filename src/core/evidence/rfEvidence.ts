import { createEvidence, EvidenceRecord } from './index';

export interface RfEvidenceInput {
  timestamp?: string;

  iface?: string;
  ssid?: string;
  bssid?: string;

  signalDbm?: number;
  noiseDbm?: number;
  snrDb?: number;

  channel?: number;
  widthMHz?: number;
  band?: string;
  mode?: string;
  mcsIndex?: number;
  txRateMbps?: number;

  neighborDetails?: Array<{
    ssid?: string;
    bssid?: string;
    channel?: number;
    band?: string;
    widthMHz?: number;
    signalDbm?: number;
    noiseDbm?: number;
    mode?: string;
    security?: string;
  }>;
}

export function buildRfEvidence(
  info: RfEvidenceInput
): EvidenceRecord[] {
  const observedAt = info.timestamp
    ? new Date(info.timestamp).toISOString()
    : new Date().toISOString();

  const source = {
    name: 'macOS Wi-Fi Evidence',
    collector: 'macosWifiEvidence'
  };

  const context = {
    interface: info.iface
  };

  const evidence: EvidenceRecord[] = [];

  if (Number.isFinite(info.signalDbm)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.rssi',
        value: info.signalDbm,
        unit: 'dBm',
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (Number.isFinite(info.noiseDbm)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.noiseFloor',
        value: info.noiseDbm,
        unit: 'dBm',
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  const snr =
    Number.isFinite(info.snrDb)
      ? info.snrDb
      : Number.isFinite(info.signalDbm) && Number.isFinite(info.noiseDbm)
        ? Number(info.signalDbm) - Number(info.noiseDbm)
        : undefined;

  if (Number.isFinite(snr)) {
    evidence.push(
      createEvidence({
        type: 'DERIVED',
        name: 'wifi.snr',
        value: snr,
        unit: 'dB',
        source: {
          name: 'JCG RF Evidence Engine',
          collector: 'rfEvidence'
        },
        context,
        observedAt,
        confidence: 100,
        notes: ['SNR calculated as RSSI minus noise floor.']
      })
    );
  }

  if (Number.isFinite(info.channel)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.channel',
        value: info.channel,
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (Number.isFinite(info.widthMHz)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.channelWidth',
        value: info.widthMHz,
        unit: 'MHz',
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (info.band) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.band',
        value: info.band,
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (info.mode) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.phyMode',
        value: info.mode,
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (Number.isFinite(info.mcsIndex)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.mcsIndex',
        value: info.mcsIndex,
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (Number.isFinite(info.txRateMbps)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.txPhyRate',
        value: info.txRateMbps,
        unit: 'Mbps',
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  if (Array.isArray(info.neighborDetails)) {
    evidence.push(
      createEvidence({
        type: 'MEASURED',
        name: 'wifi.observedRadios',
        value: info.neighborDetails,
        source,
        context,
        observedAt,
        confidence: 100
      })
    );
  }

  return evidence;
}
