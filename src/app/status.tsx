import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ByteUsage, ClusterHealth, ClusterNodeStatus } from '../api/status';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { Screen } from '../ui/Screen';
import { ErrorState, Loading } from '../ui/Status';
import { Tag } from '../ui/controls';
import { formatBytes } from '../ui/format';
import { colors, radius, space, type as typography } from '../ui/theme';

const HEALTH_COLOR: Record<ClusterHealth, string> = {
  healthy: colors.ok,
  recovering: colors.warn,
  degraded: colors.warn,
  critical: colors.danger,
};

/**
 * Cluster health, read from the node's own status API rather than inferred
 * from whether playback happens to be working. Observations distinguish live
 * telemetry from stale and last-known, because on a home cluster a node that
 * is merely asleep should not read the same as one that has lost its disks.
 */
export default function StatusScreen() {
  const { status, generation } = useMacha();
  // No signal: core's status client does not take one, and neither does
  // `router.request` (unlike `router.find`). `useAsync` discards a superseded
  // result, so leaving on this screen wastes an in-flight request rather than
  // rendering a stale one. Raised with the package session.
  const snapshot = useAsync(() => status.status(), [status, generation]);

  const cluster = snapshot.value?.cluster;

  return (
    <Screen title="Cluster" showBack onRefresh={snapshot.refresh} refreshing={snapshot.refreshing}>
      {!snapshot.value && snapshot.loading ? <Loading /> : null}
      {!snapshot.value && snapshot.error ? <ErrorState error={snapshot.error} onRetry={snapshot.refresh} /> : null}

      {cluster ? (
        <View style={styles.body}>
          <View style={styles.summary}>
            <View style={[styles.healthDot, { backgroundColor: HEALTH_COLOR[cluster.health] ?? colors.textFaint }]} />
            <Text style={styles.health}>{cluster.health}</Text>
            <Text style={styles.nodes}>
              {cluster.nodes_online} of {cluster.nodes_known} nodes online
            </Text>
          </View>

          {cluster.conditions?.length ? (
            <View style={styles.conditions}>
              {cluster.conditions.map((condition) => (
                <Text key={condition} style={styles.condition}>
                  · {condition}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.tags}>
            <Tag label={`Metadata ${cluster.metadata_availability}`} />
            <Tag label={`Generation ${cluster.metadata_generation}`} />
          </View>

          <Usage title="Storage online" usage={cluster.storage_online} known={cluster.storage_known} />
          <Usage title="Cache online" usage={cluster.cache_online} known={cluster.cache_known} />

          <Text style={styles.sectionTitle}>NODES</Text>
          {snapshot.value?.nodes.map((node) => <NodeCard key={node.id} node={node} />)}
        </View>
      ) : null}
    </Screen>
  );
}

function Usage({ title, usage, known }: { title: string; usage: ByteUsage; known: ByteUsage }) {
  const fraction = usage.capacity_bytes > 0 ? Math.min(1, usage.used_bytes / usage.capacity_bytes) : 0;
  return (
    <View style={styles.usage}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageTitle}>{title}</Text>
        <Text style={styles.usageValue}>
          {formatBytes(usage.used_bytes)} of {formatBytes(usage.capacity_bytes)}
        </Text>
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      {known.capacity_bytes !== usage.capacity_bytes ? (
        <Text style={styles.usageNote}>{formatBytes(known.capacity_bytes)} known across all nodes, including offline ones.</Text>
      ) : null}
    </View>
  );
}

function NodeCard({ node }: { node: ClusterNodeStatus }) {
  const stale = node.telemetry_freshness !== 'live';
  return (
    <View style={styles.node}>
      <View style={styles.nodeHeader}>
        <Text numberOfLines={1} style={styles.nodeId}>
          {node.id}
        </Text>
        <View
          style={[
            styles.stateDot,
            { backgroundColor: node.state === 'online' ? colors.ok : node.state === 'retired' ? colors.textFaint : colors.danger },
          ]}
        />
      </View>
      <Text style={styles.nodeMeta}>
        {[
          // The API endpoint verbatim, or nothing. `host`/`port` are the RPC
          // bind address — not necessarily reachable, and not the right
          // protocol for REST — so falling back to them printed an internal
          // address under an API label. Absent stays absent.
          node.api_endpoint,
          node.version,
          node.phase,
          stale ? node.telemetry_freshness.replace('_', ' ') : undefined,
        ]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
      <Text style={styles.nodeMeta}>
        Storage {formatBytes(node.storage.used_bytes)} / {formatBytes(node.storage.capacity_bytes)} · Cache{' '}
        {formatBytes(node.cache.used_bytes)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.lg,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  health: {
    ...typography.title,
    color: colors.text,
    textTransform: 'capitalize',
  },
  nodes: {
    ...typography.caption,
    color: colors.textFaint,
    marginLeft: 'auto',
  },
  conditions: {
    marginTop: space.md,
    gap: 2,
  },
  condition: {
    ...typography.caption,
    color: colors.warn,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  usage: {
    marginTop: space.xl,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  usageTitle: {
    ...typography.label,
    color: colors.textDim,
  },
  usageValue: {
    ...typography.caption,
    color: colors.textFaint,
  },
  usageTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  usageFill: {
    height: 6,
    backgroundColor: colors.progress,
  },
  usageNote: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: space.xs,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textFaint,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  node: {
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.xs,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  nodeId: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  nodeMeta: {
    ...typography.caption,
    color: colors.textFaint,
  },
});
