import type { ClusterNodeStatus, PlaybackSession } from '@machafoundation/core';

/**
 * How a node is named to the viewer: the operator's name where the server
 * sends one (server 0.70.0 `node_name`, such as "Corvus FI-1"). Tom: "show the
 * names the server sends". The web client's rules (web `e543e0e`), so every
 * client names a node alike. An address stays an address wherever one is
 * actually needed, as on the connect screen.
 */

/** A status node: its name, else its host, else a short id. */
export function statusNodeName(node: ClusterNodeStatus): string {
  return node.node_name?.trim() || node.host || node.id.slice(0, 12);
}

/**
 * Where a session is served from: core's endpoint name (the node's own, as
 * the registry knows it), else the address's hostname, else the address with
 * its scheme dropped. Undefined for a session that names no endpoint.
 *
 * `||`, not `??`, on the hostname: React Native's `URL` answers `''` for a
 * hostname it cannot read rather than throwing (its `Libraries/Blob/URL.js`
 * matches only `http(s)://`), and that means unread, not unnamed.
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
