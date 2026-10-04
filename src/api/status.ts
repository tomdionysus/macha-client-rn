// Re-exported from core. `ClusterStatusRouter` reads with failover;
// `checkConnectivity` is a POST, so it runs exactly once via `mutation`.
export { ClusterStatusRouter } from '@machafoundation/core';
export type {
  ByteUsage,
  ClusterHealth,
  ClusterNodeStatus,
  ClusterStatusSnapshot,
  ClusterSummaryStatus,
  ConnectivityCheck,
  MetadataAvailability,
  NodePhase,
  NodeState,
  TelemetryFreshness,
} from '@machafoundation/core';
