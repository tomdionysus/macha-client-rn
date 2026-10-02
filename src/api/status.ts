// Wire types and the routed client are core's. `ClusterStatusRouter` reads
// with failover, while `checkConnectivity` goes through `mutation` because it
// is a diagnostic POST that makes the node act and must execute exactly once.
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
