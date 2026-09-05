import {
  EvidenceConfidence,
  EvidenceContext,
  EvidenceSource,
  EvidenceType
} from './evidenceTypes';

export interface EvidenceRecord<T = unknown> {
  id: string;
  type: EvidenceType;

  name: string;
  value: T;
  unit?: string;

  source: EvidenceSource;
  context?: EvidenceContext;

  observedAt: string;
  collectedAt: string;

  freshnessMs?: number;

  confidence?: EvidenceConfidence;

  notes?: string[];

  derivedFrom?: string[];
}
