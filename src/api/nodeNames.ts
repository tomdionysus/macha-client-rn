import type { ClusterNodeStatus, PlaybackSession } from '@machafoundation/core';

// How a node is named to the viewer, by the same rules as the web client:
// the operator's name (`node_name`) where the server sends one.

/** A status node: its name, else its host, else a short id. */
export function statusNodeName(node: ClusterNodeStatus): string {
  return node.node_name?.trim() || node.host || node.id.slice(0, 12);
}

/**
 * Where a session is served from: core's endpoint name, else the address's
 * hostname, else the address without its scheme. `||` because React Native's
 * `URL` returns `''` for a hostname it cannot parse rather than throwing.
 */
export function sessionNodeName(session: Pick<PlaybackSession, 'endpoint'>): string | undefined {
  const name = session.endpoint?.name?.trim();
  if (name) return name;
  const base = session.endpoint?.baseUrl?.trim();
  if (!base) return undefined;
  return hostname(base) || base.replace(/^https?:\/\//i, '') || undefined;
}

function hostname(address: string): string {
  try {
    return new URL(address).hostname;
  } catch {
    return '';
  }
}
