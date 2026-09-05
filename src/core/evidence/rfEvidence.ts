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

  rfProbeState?: 'fresh' | 'cached' | 'pending' | 'failed';
  rfProbeAgeMs?: number;

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
  const sampleTimestamp = info.timestamp
    ? new Date(info.timestamp).getTime()
    : Date.now();

  const collectedAt = new Date(sampleTimestamp).toISOString();

  const rfAgeMs = Number.isFinite(info.rfProbeAgeMs)
    ? Math.max(0, Number(info.rfProbeAgeMs))
    : 0;

  // system_profiler RF telemetry may come from the collector cache.
  // Move observedAt backwards by the actual RF probe age so freshness
  // represents evidence age rather than normalization latency.
  const rfObservedAt = new Date(sampleTimestamp - rfAgeMs).toISOString();

  const liveObservedAt = new Date(sampleTimestamp).toISOString();

  const source = {
    name: 'macOS Wi-Fi Evidence',
    collector: 'macosWifiEvidence'
  };

  const context = {
    interface: info.iface
  };

  const evidence: EvidenceRecord[] = [];

  let rssiEvidenceId: string | undefined;
  let noiseEvidenceId: string | undefined;

  if (Number.isFinite(info.signalDbm)) {
    const record = createEvidence({
      type: 'MEASURED',
      name: 'wifi.rssi',
      value: info.signalDbm,
      unit: 'dBm',
      source,
      context,
      observedAt: rfObservedAt,
      collectedAt,
      confidence: 100
    });

    rssiEvidenceId = record.id;
    evidence.push(record);
  }

  if (Number.isFinite(info.noiseDbm)) {
    const record = createEvidence({
      type: 'MEASURED',
      name: 'wifi.noiseFloor',
      value: info.noiseDbm,
      unit: 'dBm',
      source,
      context,
      observedAt: rfObservedAt,
      collectedAt,
      confidence: 100
    });

    noiseEvidenceId = record.id;
    evidence.push(record);
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
        observedAt: rfObservedAt,
        collectedAt,
        confidence: 100,
        notes: ['SNR calculated as RSSI minus noise floor.'],
        derivedFrom: [
          rssiEvidenceId,
          noiseEvidenceId
        ].filter((id): id is string => Boolean(id))
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
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
        observedAt: rfObservedAt,
        collectedAt,
        confidence: 100,
        notes: [
          `RF probe state: ${info.rfProbeState ?? 'unknown'}`,
          `RF probe age: ${rfAgeMs} ms`
        ]
      })
    );
  }

  return evidence;
}
