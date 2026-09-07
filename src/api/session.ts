import { MachaApiError, serverUnreachable } from './errors';
import { fetchWithTimeout, isGatewayConnectionFailure, mergeHeaders, normalizeBaseUrl, readBody } from './http';
import { EndpointRegistry } from './endpoints';

export interface AnonymousSession {
  token: string;
  expiresAtMs: number;
}

/** Everything an API client needs in order to make an authenticated request. */
export interface AuthenticatedFetch {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** Current bearer token, for consumers that must build their own request (images, media). */
  readonly token: string | undefined;
}

/** A fixed, never-refreshed token: the Settings screen's manual override, and the test double. */
export function fixedBearerToken(token: string | undefined): AuthenticatedFetch {
  const trimmed = token?.trim() || undefined;
  return {
    get token() {
      return trimmed;
    },
    fetch: (url, init = {}) =>
      fetch(url, {
        ...init,
        headers: mergeHeaders(init.headers, { Authorization: trimmed ? `Bearer ${trimmed}` : undefined }),
      }),
  };
}

export const NO_AUTH: AuthenticatedFetch = fixedBearerToken(undefined);

/** `POST /api/v1/session` — the one endpoint that takes no Authorization header. */
export async function mintAnonymousSession(baseUrl: string): Promise<AnonymousSession> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/session`;
  const response = await fetchWithTimeout(
    (target, init) => fetch(target, init),
    url,
    {
      method: 'POST',
      headers: mergeHeaders(undefined, { Accept: 'application/json', 'Content-Type': 'application/json' }),
      body: '{}',
    },
  );
  const { body, wasJson } = await readBody(response);
  if (isGatewayConnectionFailure(response, wasJson)) throw serverUnreachable();
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  if (!response.ok) {
    const message = typeof record?.message === 'string' ? record.message : `${response.status} ${response.statusText}`;
    throw new MachaApiError(`Could not start a session: ${message}`, response.status);
  }
  const token = typeof record?.token === 'string' ? record.token : undefined;
  const expiresAtMs = typeof record?.expires_unix_ms === 'number' ? record.expires_unix_ms : undefined;
  if (!token || expiresAtMs === undefined) throw new MachaApiError('Node returned a malformed session response.');
  return { token, expiresAtMs };
}

/** A session minted by any node is valid cluster-wide, so one dead node must not block getting a token. */
async function mintAnyNode(registry: EndpointRegistry): Promise<AnonymousSession> {
  let lastError: unknown;
  for (const { endpoint } of registry.candidates()) {
    try {
      const session = await mintAnonymousSession(endpoint.baseUrl);
      registry.recordSuccess(endpoint.id);
      return session;
    } catch (error) {
      lastError = error;
      registry.recordFailure(endpoint.id, error);
    }
  }
  throw lastError ?? serverUnreachable();
}

const RETRY_AFTER_MINT_FAILURE_MS = 10_000;
const REFRESH_SAFETY_MARGIN_MS = 30_000;
/** `setTimeout` delays are a 32-bit int internally; long waits are chunked into re-checks. */
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Owns the anonymous session end to end — minting, proactive refresh before
 * expiry, reactive re-mint on 401, and attaching the current token to every
 * request. Every API client goes through this (or `fixedBearerToken`, for the
 * manual override) instead of assembling auth headers itself.
 *
 * The session is deliberately memory-only. It is cheap to re-mint on a cold
 * start, and a token surviving in device storage would outlive the app that
 * earned it for no benefit.
 */
export class SessionManager implements AuthenticatedFetch {
  private current: string | undefined;
  private ready = false;
  private cancelled = true;
  private inFlight: Promise<void> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private registry: EndpointRegistry | undefined;
  private readonly listeners = new Set<() => void>();

  get token(): string | undefined {
    return this.current;
  }

  get isReady(): boolean {
    return this.ready;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(registry: EndpointRegistry): void {
    this.stop();
    this.cancelled = false;
    this.ready = false;
    this.current = undefined;
    this.registry = registry;
    void this.mint();
  }

  stop(): void {
    this.cancelled = true;
    this.registry = undefined;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  /**
   * An authenticated request, end to end.
   *
   * A request fired before the first token exists waits for that mint instead
   * of going out tokenless — a request that can only 401 is not worth sending.
   * A 401 against the token that was actually sent means that session is dead:
   * re-mint (coalesced with any mint already running) and retry once. A 401 for
   * a token that has *already* been replaced must not mint again, or it would
   * clobber the good new session.
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.current === undefined && this.inFlight) await this.inFlight;
    const sent = this.current;
    const response = await this.send(url, init, sent);
    if (response.status !== 401 || sent === undefined) return response;
    await (this.current === sent ? this.mint() : (this.inFlight ?? Promise.resolve()));
    const next = this.current;
    if (next === undefined || next === sent) return response;
    return this.send(url, init, next);
  }

  private send(url: string, init: RequestInit, token: string | undefined): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: mergeHeaders(init.headers, { Authorization: token ? `Bearer ${token}` : undefined }),
    });
  }

  private mint(): Promise<void> {
    const registry = this.registry;
    if (!registry) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        const session = await mintAnyNode(registry);
        if (this.cancelled) return;
        this.current = session.token;
        this.settle();
        this.scheduleRefresh(session.expiresAtMs);
      } catch {
        if (this.cancelled) return;
        this.current = undefined;
        this.settle();
        this.refreshTimer = setTimeout(() => {
          void this.mint();
        }, RETRY_AFTER_MINT_FAILURE_MS);
      }
    })().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private settle(): void {
    this.ready = true;
    for (const listener of this.listeners) listener();
  }

  private scheduleRefresh(expiresAtMs: number): void {
    if (this.cancelled) return;
    const remainingMs = expiresAtMs - Date.now() - REFRESH_SAFETY_MARGIN_MS;
    if (remainingMs <= 0) {
      void this.mint();
      return;
    }
    this.refreshTimer = setTimeout(() => this.scheduleRefresh(expiresAtMs), Math.min(remainingMs, MAX_TIMER_DELAY_MS));
  }
}

/**
 * Chooses between the node's anonymous session flow and an explicitly
 * configured `catalogue.api.token_file` bearer token. A manual token always
 * wins: if the operator gave one, minting would only fail.
 */
export function authFor(manualToken: string | undefined, sessions: SessionManager): AuthenticatedFetch {
  const trimmed = manualToken?.trim();
  return trimmed ? fixedBearerToken(trimmed) : sessions;
}
