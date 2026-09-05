import { MerakiApiError, MerakiConfigurationError, MerakiPaginationError } from './merakiErrors';
import {
  MerakiApiKeyProvider,
  MerakiFetch,
  MerakiPage,
  MerakiRequestOptions,
  MerakiResponseMetadata,
  MerakiSleep,
} from './merakiTypes';

const DEFAULT_BASE_URL = 'https://api.meraki.com/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_PAGES = 100;

export interface MerakiClientOptions {
  apiKey: MerakiApiKeyProvider;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxPages?: number;
  fetchFn?: MerakiFetch;
  sleep?: MerakiSleep;
  random?: () => number;
}

export class MerakiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxPages: number;
  private readonly fetchFn: MerakiFetch;
  private readonly sleep: MerakiSleep;
  private readonly random: () => number;
  private readonly apiKey: MerakiApiKeyProvider;

  constructor(options: MerakiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
  }

  async get<T>(path: string, options: MerakiRequestOptions = {}): Promise<MerakiPage<T>> {
    const url = this.buildUrl(path, options.query);
    return this.request<T>(url);
  }

  async getAllPages<T>(path: string, options: MerakiRequestOptions = {}): Promise<{ data: T[]; metadata: MerakiResponseMetadata[] }> {
    let nextUrl = this.buildUrl(path, options.query);
    const visited = new Set<string>();
    const data: T[] = [];
    const metadata: MerakiResponseMetadata[] = [];

    for (let page = 0; nextUrl; page += 1) {
      if (page >= this.maxPages) {
        throw new MerakiPaginationError(`Meraki pagination exceeded the ${this.maxPages}-page limit`);
      }
      if (visited.has(nextUrl)) {
        throw new MerakiPaginationError('Meraki pagination loop detected');
      }
      if (new URL(nextUrl).origin !== new URL(this.baseUrl).origin) {
        throw new MerakiPaginationError('Meraki pagination link has an unexpected origin');
      }
      visited.add(nextUrl);

      const result = await this.request<T[]>(nextUrl);
      if (!Array.isArray(result.data)) {
        throw new MerakiPaginationError('Meraki paginated response was not an array');
      }
      data.push(...result.data);
      metadata.push(result.metadata);
      nextUrl = result.metadata.nextLink ?? '';
    }

    return { data, metadata };
  }

  private async request<T>(url: string): Promise<MerakiPage<T>> {
    const apiKey = await this.resolveApiKey();
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Cisco-Meraki-API-Key': apiKey,
          },
          signal: controller.signal,
        });
        const metadata = await this.readMetadata(response);

        if (response.ok) {
          return { data: await this.readJson<T>(response), metadata };
        }

        const body = await this.readErrorBody(response);
        if (this.isRetryable(response.status) && attempt < this.maxRetries) {
          await this.sleep(this.retryDelayMs(response, attempt));
          attempt += 1;
          continue;
        }

        throw new MerakiApiError({
          message: `Meraki API request failed with HTTP ${response.status}`,
          status: response.status,
          responseHeaders: metadata.headers,
          requestId: metadata.requestId,
          rateLimit: metadata.rateLimit,
          responseBody: body,
        });
      } catch (error) {
        if (error instanceof MerakiApiError || error instanceof MerakiPaginationError) throw error;
        if (attempt >= this.maxRetries) {
          throw new MerakiApiError({
            message: 'Meraki API request failed',
            status: 0,
            responseBody: error instanceof Error ? error.message : undefined,
          });
        }
        await this.sleep(this.retryDelayMs(undefined, attempt));
        attempt += 1;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private async resolveApiKey(): Promise<string> {
    const value = typeof this.apiKey === 'string'
      ? this.apiKey
      : typeof this.apiKey === 'function'
        ? await this.apiKey()
        : await this.apiKey.getApiKey();
    if (!value) throw new MerakiConfigurationError('Meraki API key was not provided');
    return value;
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(path.replace(/^\//, ''), `${this.baseUrl}/`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  private isRetryable(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  private retryDelayMs(response: Response | undefined, attempt: number): number {
    const retryAfter = response?.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    const base = Math.min(1000 * 2 ** attempt, 10000);
    return Math.round(base * (0.5 + this.random()));
  }

  private async readMetadata(response: Response): Promise<MerakiResponseMetadata> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    const retryAfter = response.headers.get('retry-after');
    const rateLimit = {
      limit: this.numberHeader(response.headers.get('x-rate-limit-limit')),
      remaining: this.numberHeader(response.headers.get('x-rate-limit-remaining')),
      retryAfterMs: retryAfter ? this.retryDelayMs(response, 0) : undefined,
    };
    const nextLink = this.parseNextLink(response.headers.get('link'));
    return {
      status: response.status,
      headers,
      requestId: response.headers.get('x-request-id') ?? response.headers.get('x-cisco-meraki-request-id') ?? undefined,
      rateLimit: Object.values(rateLimit).some(value => value !== undefined) ? rateLimit : undefined,
      nextLink,
    };
  }

  private parseNextLink(value: string | null): string | undefined {
    if (!value) return undefined;
    const links = value.split(/,\s*(?=<)/).map(entry => {
      const match = entry.match(/^\s*<([^>]+)>\s*(?:;\s*rel\s*=\s*"?([^";]+)"?)?\s*$/i);
      if (!match) throw new MerakiPaginationError('Malformed Meraki Link header');
      return { url: match[1], rel: match[2]?.trim() };
    });
    return links.find(link => link.rel === 'next')?.url;
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      throw new MerakiApiError({
        message: 'Meraki API returned malformed JSON',
        status: response.status,
        responseHeaders: this.headers(response),
      });
    }
  }

  private async readErrorBody(response: Response): Promise<unknown> {
    try { return await response.json(); } catch { return await response.text().catch(() => undefined); }
  }

  private headers(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return headers;
  }

  private numberHeader(value: string | null): number | undefined {
    if (value === null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
