import { describe, expect, it } from 'vitest';
import type { ClusterNodeStatus, PlaybackSession } from '@machafoundation/core';
import { sessionNodeName, statusNodeName } from './nodeNames';

describe('naming a status node', () => {
  const node = (fields: Partial<ClusterNodeStatus>) => ({ id: '0123456789abcdef0123', host: '10.35.1.50', ...fields }) as ClusterNodeStatus;

  it("shows the operator's name (server 0.70.0), trimmed, over the host", () => {
    expect(statusNodeName(node({ node_name: ' Corvus FI-1 ' }))).toBe('Corvus FI-1');
  });

  it('falls back to the host, then to a short id, for a blank or missing name', () => {
    expect(statusNodeName(node({ node_name: '  ' }))).toBe('10.35.1.50');
    expect(statusNodeName(node({ node_name: null }))).toBe('10.35.1.50');
    expect(statusNodeName(node({ host: '' }))).toBe('0123456789ab');
  });
});

describe('naming the node a session is served from', () => {
  const at = (endpoint: PlaybackSession['endpoint']) => ({ endpoint });

  it("shows core's endpoint name, the node's own", () => {
    expect(sessionNodeName(at({ id: 'e', baseUrl: 'http://10.35.1.50:7438', name: 'Corvus FI-1' }))).toBe('Corvus FI-1');
  });

  it('falls back to the hostname, with no scheme and no port', () => {
    expect(sessionNodeName(at({ id: 'e', baseUrl: 'https://macnessa.macha.network' }))).toBe('macnessa.macha.network');
    expect(sessionNodeName(at({ id: 'e', baseUrl: 'http://10.35.1.50:7438', name: ' ' }))).toBe('10.35.1.50');
  });

  it('shows the address as it is when its hostname cannot be read', () => {
    expect(sessionNodeName(at({ id: 'e', baseUrl: 'file:///macha' }))).toBe('file:///macha');
  });

  it('names nothing for a session with no endpoint', () => {
    expect(sessionNodeName(at(undefined))).toBeUndefined();
  });
});
