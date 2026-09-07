import { MachaApiError, MachaConnectionError, isAbortError, parseErrorEnvelope, serverUnreachable } from './errors';

/**
 * Applies to catalogue/status/control requests. Media transfers are exempt —
 * the native player owns its own deadlines.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export type HeaderValues = Record<string, string | undefined>;

export function mergeHeaders(initial: HeadersInit | undefined, values: HeaderValues): Record<string, string> {
  const result: Record<string, string> = {};
  if (initial) {
    if (Array.isArray(initial)) {
      for (const [key, value] of initial) result[key] = value;
    } else if (typeof (initial as Headers).forEach === 'function') {
      (initial as Headers).forEach((value, key) => {
        result[key] = value;
      });
    } else {
      Object.assign(result, initial as Record<string, string>);
    }
  }
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function queryString(entries: ReadonlyArray<readonly [string, string | undefined]>): string {
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.replace(/\/+$/, '');
}

/**
 * Accepts what a person actually types into the connect screen — `10.0.0.4`,
 * `10.0.0.4:7438`, `macha.local` — and produces a base URL. A bare host with
 * no scheme means `http`, because Macha's default is a plain-HTTP LAN node.
 */
export function coerceEndpointUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const normalized = normalizeBaseUrl(withScheme);
  try {
    const url = new URL(normalized);
    if (!url.hostname) return '';
    if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_MACHA_PORT);
    return normalizeBaseUrl(url.origin);
  } catch {
    return '';
  }
}

export const DEFAULT_MACHA_PORT = 7438;

/**
 * `fetch` bounded by a deadline and composed with the caller's own
 * cancellation. A timeout surfaces as `MachaConnectionError` because, from
 * here, a request that never answers is indistinguishable from a node that
 * never answers and has to fail over the same way. A genuine caller abort
 * stays an AbortError so endpoint health never learns from user intent.
 */
export async function fetchWithTimeout(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const consumerSignal = init.signal ?? undefined;
  let timedOut = false;
  const onConsumerAbort = () => controller.abort();
  if (consumerSignal) {
    if (consumerSignal.aborted) onConsumerAbort();
    else consumerSignal.addEventListener('abort', onConsumerAbort);
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new MachaConnectionError(`No answer from ${url} within ${timeoutMs} ms.`);
    if (isAbortError(error)) throw error;
    throw serverUnreachable();
  } finally {
    clearTimeout(timer);
    consumerSignal?.removeEventListener('abort', onConsumerAbort);
  }
}

export interface ParsedBody {
  body: unknown;
  wasJson: boolean;
}

export async function readBody(response: Response): Promise<ParsedBody> {
  try {
    return { body: (await response.json()) as unknown, wasJson: true };
  } catch {
    return { body: undefined, wasJson: false };
  }
}

/**
 * A proxy in front of an offline node answers 502/503/504 with HTML, not a
 * Macha error envelope. That is an unreachable node, not an API failure.
 */
export function isGatewayConnectionFailure(response: Response, wasJson: boolean): boolean {
  return !wasJson && (response.status === 502 || response.status === 503 || response.status === 504);
}

export function retryAfterMs(value: string | null): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(100, Math.round(seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(100, date - Date.now()) : 1_000;
}

export async function throwResponseError(response: Response, what: string): Promise<never> {
  const { body, wasJson } = await readBody(response);
  if (isGatewayConnectionFailure(response, wasJson)) throw serverUnreachable();
  const parsed = parseErrorEnvelope(body, `${response.status} ${response.statusText}`.trim());
  throw new MachaApiError(
    `${what}: ${parsed.message}`,
    response.status,
    parsed.code,
    retryAfterMs(response.headers.get('retry-after')),
  );
}
