import { isGatewayConnectionFailure, normalizeBaseUrl, readResponseBody } from '@machafoundation/core';
import { MachaApiError, parseErrorEnvelope, serverUnreachable } from './errors';

/**
 * Applies to catalogue/status/control requests. Media transfers are exempt —
 * the native player owns its own deadlines.
 */
// The HTTP primitives are core's. They are aliased to this module's existing
// names rather than renamed at ~40 call sites: the implementation is what was
// duplicated, not the vocabulary. `mergeRequestHeaders` exists because older
// Tizen Chromium exposes only the earliest `Headers` constructor shape — a
// browser fact this client will never meet, but not a reason to keep a second
// implementation of the same function.
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  normalizeBaseUrl,
  queryString,
  mergeRequestHeaders as mergeHeaders,
  readResponseBody as readBody,
  type HeaderValues,
  type ParsedResponseBody as ParsedBody,
} from '@machafoundation/core';

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

// Gateway-failure classification is core's. The rule is 502/504 unconditionally
// — Macha proxies nothing, so it emits neither, and gating them on a non-JSON
// body misreads a JSON-emitting load balancer as the application answering —
// plus 500 or 503 only when the body was not JSON, because a Macha error
// envelope proves the request reached the application. 503-without-body is
// HAProxy's answer for a backend that is gone, which is what the API now sits
// behind for TLS offload.
export { isGatewayConnectionFailure };

export function retryAfterMs(value: string | null): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(100, Math.round(seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(100, date - Date.now()) : 1_000;
}

export async function throwResponseError(response: Response, what: string): Promise<never> {
  const { body, wasJson } = await readResponseBody(response);
  if (isGatewayConnectionFailure(response, wasJson)) throw serverUnreachable();
  const parsed = parseErrorEnvelope(body, `${response.status} ${response.statusText}`.trim());
  throw new MachaApiError(
    `${what}: ${parsed.message}`,
    response.status,
    parsed.code,
    retryAfterMs(response.headers.get('retry-after')),
    parsed.reason,
  );
}
