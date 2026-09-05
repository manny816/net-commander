import { MerakiRateLimitMetadata } from './merakiTypes';

export class MerakiApiError extends Error {
  readonly status: number;
  readonly responseHeaders: Record<string, string>;
  readonly requestId?: string;
  readonly rateLimit?: MerakiRateLimitMetadata;
  readonly responseBody?: unknown;

  constructor(options: {
    message: string;
    status: number;
    responseHeaders?: Record<string, string>;
    requestId?: string;
    rateLimit?: MerakiRateLimitMetadata;
    responseBody?: unknown;
  }) {
    super(options.message);
    this.name = 'MerakiApiError';
    this.status = options.status;
    this.responseHeaders = options.responseHeaders ?? {};
    this.requestId = options.requestId;
    this.rateLimit = options.rateLimit;
    this.responseBody = options.responseBody;
  }
}

export class MerakiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MerakiConfigurationError';
  }
}

export class MerakiPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MerakiPaginationError';
  }
}
