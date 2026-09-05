import { randomUUID } from 'crypto';

import { EvidenceRecord } from './evidenceRecord';
import {
  EvidenceContext,
  EvidenceSource,
  EvidenceType
} from './evidenceTypes';

export interface CreateEvidenceOptions<T> {
  type: EvidenceType;

  name: string;
  value: T;
  unit?: string;

  source: EvidenceSource;
  context?: EvidenceContext;

  observedAt?: string;
  collectedAt?: string;

  confidence?: number;

  notes?: string[];

  derivedFrom?: string[];
}

export function createEvidence<T>(
  options: CreateEvidenceOptions<T>
): EvidenceRecord<T> {
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const observedAt = options.observedAt ?? collectedAt;

  const freshnessMs = Math.max(
    0,
    Date.parse(collectedAt) - Date.parse(observedAt)
  );

  return {
    id: randomUUID(),

    type: options.type,

    name: options.name,
    value: options.value,
    unit: options.unit,

    source: options.source,
    context: options.context,

    observedAt,
    collectedAt,

    freshnessMs,

    confidence: normalizeConfidence(options.confidence),

    notes: options.notes,
    derivedFrom: options.derivedFrom
  };
}

function normalizeConfidence(
  confidence: number | undefined
): number | undefined {
  if (confidence === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, confidence));
}
