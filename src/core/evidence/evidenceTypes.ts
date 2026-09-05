export type EvidenceType =
  | 'MEASURED'
  | 'VENDOR_REPORTED'
  | 'DERIVED'
  | 'INFERRED';

export type EvidenceConfidence = number;

export interface EvidenceSource {
  name: string;
  collector: string;
  vendor?: string;
  endpoint?: string;
  command?: string;
  requestId?: string;
  rawReference?: string;
}

export interface EvidenceContext {
  incidentId?: string;
  site?: string;
  deviceId?: string;
  interface?: string;
  clientId?: string;
  networkId?: string;
  organizationId?: string;
}
