// Wire types and the routed client are both core's. `ClusterStatusRouter`
// implements `ClusterStatusApi` over a per-endpoint `MachaClusterStatusApi`,
// and is the reason this file no longer holds a class: reads fail over,
// while `checkConnectivity` goes through `mutation` because it is a diagnostic
// POST that makes the node do something and must execute exactly once.
export { ClusterStatusRouter } from '@macha/core';
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
} from '@macha/core';
