import { DEFAULT_REQUEST_TIMEOUT_MS, fetchWithTimeout, mergeHeaders, normalizeBaseUrl, throwResponseError } from './http';
import { EndpointRegistry, withEndpointFailover } from './endpoints';
import { NO_AUTH, type AuthenticatedFetch } from './session';

export type TelemetryFreshness = 'live' | 'stale' | 'last_known' | 'unavailable';
export type NodeState = 'online' | 'offline' | 'retired';
export type NodePhase = 'starting' | 'recovering' | 'ready' | 'unknown';
export type ClusterHealth = 'healthy' | 'recovering' | 'degraded' | 'critical';
export type MetadataAvailability = 'unavailable' | 'read-only' | 'writable';

export interface ByteUsage {
  capacity_bytes: number;
  used_bytes: number;
  free_bytes: number;
}

export interface ClusterNodeStatus {
  id: string;
  state: NodeState;
  phase?: NodePhase;
  telemetry_freshness: TelemetryFreshness;
  observed_at_unix_ms: number;
  live_age_ms: number | null;
  version: string;
  host: string;
  port: number;
  /**
   * Where clients should reach this node's HTTP API — distinct from
   * `host`/`port`, which is the internal RPC bind address and is not
   * necessarily reachable, or even the right protocol, for REST calls.
   */
  api_host?: string;
  api_port?: number;
  failure_domain: string;
  metadata_generation: number;
  storage: ByteUsage;
  cache: ByteUsage;
  storage_backends_online: number;
  roles: string[];
}

export interface ClusterSummaryStatus {
  health: ClusterHealth;
  conditions: string[];
  nodes_known: number;
  nodes_online: number;
  metadata_generation: number;
  metadata_availability: MetadataAvailability;
  metadata_read_available: boolean;
  metadata_write_available: boolean;
  storage_known: ByteUsage;
  storage_online: ByteUsage;
  cache_known: ByteUsage;
  cache_online: ByteUsage;
}

export interface ClusterStatusSnapshot {
  cluster: ClusterSummaryStatus;
  nodes: ClusterNodeStatus[];
  generated_at_unix_ms: number;
}

export class ClusterStatusApi {
  constructor(private readonly registry: EndpointRegistry, private readonly auth: AuthenticatedFetch = NO_AUTH) {}

  status(signal?: AbortSignal): Promise<ClusterStatusSnapshot> {
    return withEndpointFailover(this.registry, async (endpoint) => {
      const base = normalizeBaseUrl(endpoint.baseUrl);
      const response = await fetchWithTimeout(
        (url, init) => this.auth.fetch(url, init),
        `${base}/api/v1/status`,
        { method: 'GET', headers: mergeHeaders(undefined, { Accept: 'application/json' }), signal },
        DEFAULT_REQUEST_TIMEOUT_MS,
      );
      if (!response.ok) await throwResponseError(response, 'Macha status request failed');
      return (await response.json()) as ClusterStatusSnapshot;
    });
  }

  /**
   * Client-facing API bases advertised by the live cluster, merged into the
   * registry as discovered candidates — never persisted as user configuration,
   * and never derived from the internal `host`/`port` RPC fields.
   *
   * The wire contract advertises a host and port but no scheme, so the scheme
   * of the endpoint that actually answered is carried over rather than assumed:
   * a cluster reached over TLS should not have its peers probed as plain HTTP.
   */
  static advertisedApiBases(snapshot: ClusterStatusSnapshot, scheme: 'http' | 'https' = 'http'): string[] {
    return snapshot.nodes
      .filter((node) => node.state === 'online' && node.api_host && node.api_port)
      .map((node) => `${scheme}://${node.api_host}:${node.api_port}`);
  }
}
