import { isEndpointFailure } from './errors';
import { normalizeBaseUrl } from './http';

export interface Endpoint {
  /** Stable identity for health accounting. The normalized base URL is enough. */
  id: string;
  baseUrl: string;
  /** `configured` seeds come from the user; `discovered` ones from a live node. */
  source: 'configured' | 'discovered';
}

interface Health {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastSuccessAt: number;
}

/** Two strikes before a node is rested — one blip should not cost a working node. */
const FAILURES_BEFORE_COOLDOWN = 2;
const COOLDOWN_MS = 30_000;

export interface EndpointCandidate {
  endpoint: Endpoint;
  /** True when the endpoint is only being tried because everything is cooling down. */
  lastResort: boolean;
}

/**
 * The client's view of which Macha nodes are worth talking to next.
 *
 * Configured URLs are bootstrap seeds, not a membership list. Any node can
 * answer any catalogue or session request, so a request that fails on one node
 * is retried on the next rather than surfaced to the viewer. The endpoint that
 * last worked stays preferred ("sticky") so ordinary browsing does not wander
 * between nodes and lose HTTP connection reuse.
 */
export class EndpointRegistry {
  private endpoints: Endpoint[] = [];
  private readonly health = new Map<string, Health>();
  private preferredId: string | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(baseUrls: readonly string[] = []) {
    this.replace(baseUrls);
  }

  get all(): readonly Endpoint[] {
    return this.endpoints;
  }

  get isEmpty(): boolean {
    return this.endpoints.length === 0;
  }

  /** The endpoint a caller should use when it only gets one attempt (artwork, images). */
  get preferred(): Endpoint | undefined {
    return this.candidates()[0]?.endpoint;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  replace(baseUrls: readonly string[], source: Endpoint['source'] = 'configured'): void {
    const seen = new Set<string>();
    const next: Endpoint[] = [];
    for (const raw of baseUrls) {
      const baseUrl = normalizeBaseUrl(raw);
      if (!baseUrl || seen.has(baseUrl)) continue;
      seen.add(baseUrl);
      next.push({ id: baseUrl, baseUrl, source });
    }
    this.endpoints = next;
    for (const id of [...this.health.keys()]) if (!seen.has(id)) this.health.delete(id);
    if (this.preferredId && !seen.has(this.preferredId)) this.preferredId = undefined;
    this.notify();
  }

  /**
   * Merge in nodes a live cluster advertised. Discovered members never displace
   * or persist as user configuration — they are only extra places to try.
   */
  merge(baseUrls: readonly string[], source: Endpoint['source'] = 'discovered'): void {
    let changed = false;
    for (const raw of baseUrls) {
      const baseUrl = normalizeBaseUrl(raw);
      if (!baseUrl || this.endpoints.some((endpoint) => endpoint.id === baseUrl)) continue;
      this.endpoints = [...this.endpoints, { id: baseUrl, baseUrl, source }];
      changed = true;
    }
    if (changed) this.notify();
  }

  /**
   * Endpoints in the order they should be tried: the sticky one first, then
   * healthy nodes, then — only if nothing is healthy — resting ones, so a
   * whole-cluster cooldown can still recover instead of deadlocking.
   */
  candidates(): EndpointCandidate[] {
    const now = Date.now();
    const ready: Endpoint[] = [];
    const resting: Endpoint[] = [];
    for (const endpoint of this.endpoints) {
      const health = this.health.get(endpoint.id);
      if (health && health.cooldownUntil > now) resting.push(endpoint);
      else ready.push(endpoint);
    }
    const order = ready.length > 0 ? ready : resting;
    const lastResort = ready.length === 0;
    const preferredIndex = order.findIndex((endpoint) => endpoint.id === this.preferredId);
    const sorted = preferredIndex > 0
      ? [order[preferredIndex], ...order.slice(0, preferredIndex), ...order.slice(preferredIndex + 1)]
      : order;
    const tail = ready.length > 0 ? resting : [];
    return [...sorted, ...tail].map((endpoint) => ({ endpoint, lastResort }));
  }

  recordSuccess(id: string): void {
    const previous = this.health.get(id);
    this.health.set(id, { consecutiveFailures: 0, cooldownUntil: 0, lastSuccessAt: Date.now() });
    const changed = this.preferredId !== id || (previous?.consecutiveFailures ?? 0) > 0;
    this.preferredId = id;
    if (changed) this.notify();
  }

  recordFailure(id: string, error?: unknown): void {
    if (error !== undefined && !isEndpointFailure(error)) return;
    const current = this.health.get(id) ?? { consecutiveFailures: 0, cooldownUntil: 0, lastSuccessAt: 0 };
    const consecutiveFailures = current.consecutiveFailures + 1;
    this.health.set(id, {
      ...current,
      consecutiveFailures,
      cooldownUntil: consecutiveFailures >= FAILURES_BEFORE_COOLDOWN ? Date.now() + COOLDOWN_MS : current.cooldownUntil,
    });
    if (this.preferredId === id) this.preferredId = undefined;
    this.notify();
  }

  isHealthy(id: string): boolean {
    const health = this.health.get(id);
    return !health || health.cooldownUntil <= Date.now();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Runs `attempt` against each candidate node in turn, stopping at the first
 * success. Only endpoint-shaped failures move on: a 404 from a node that is
 * plainly answering is the answer, not a reason to ask somebody else.
 */
export async function withEndpointFailover<T>(
  registry: EndpointRegistry,
  attempt: (endpoint: Endpoint) => Promise<T>,
): Promise<T> {
  const candidates = registry.candidates();
  if (candidates.length === 0) throw new Error('No Macha endpoint is configured.');
  let lastError: unknown;
  for (const { endpoint } of candidates) {
    try {
      const result = await attempt(endpoint);
      registry.recordSuccess(endpoint.id);
      return result;
    } catch (error) {
      lastError = error;
      if (!isEndpointFailure(error)) throw error;
      registry.recordFailure(endpoint.id, error);
    }
  }
  throw lastError;
}
