import { describe, expect, it } from 'vitest';
import {
  endpointFailure,
  MachaPlaybackError,
  REGENERATION_ENDPOINT_GONE_CODE,
  SESSION_PROVENANCE_UNKNOWN_CODE,
} from '@machafoundation/core';
import { classifyProbe, recoveryAfterProbe } from './policy';

/**
 * A reaped session is not the node failing. After a pause past `session_idle`
 * the node reaps it and the next fragment 404s; failing over would charge an
 * honest node and move to one that never held the session. expo-video hides
 * the status, so the client asks the owning node via `sessionAlive`, which
 * charges nothing. Errors from an already replaced source are settled out first.
 */

describe('classifyProbe', () => {
  it('reads the node’s answer as it is', () => {
    expect(classifyProbe({ alive: true })).toBe('alive');
    expect(classifyProbe({ alive: false })).toBe('gone');
  });

  it('knows core’s code for an id it cannot place, through the cluster wrapper', () => {
    const unknown = new MachaPlaybackError('no provenance', undefined, SESSION_PROVENANCE_UNKNOWN_CODE);
    expect(classifyProbe({ error: unknown })).toBe('unknown-provenance');
    expect(classifyProbe({ error: endpointFailure('e', 'http://node', unknown) })).toBe('unknown-provenance');
  });

  it('calls anything else a probe that could not be answered', () => {
    expect(classifyProbe({ error: new TypeError('Network request failed') })).toBe('unreachable');
    // A code core uses for regeneration is not a probe answer.
    const gone = new MachaPlaybackError('gone', undefined, REGENERATION_ENDPOINT_GONE_CODE);
    expect(classifyProbe({ error: gone })).toBe('unreachable');
  });
});

describe('recoveryAfterProbe', () => {
  it('regenerates on the same node when the node has forgotten the session', () => {
    // Same node, nothing charged: every other node would 404 a session it never held.
    expect(recoveryAfterProbe('gone', 1_900_000, undefined)).toBe('regenerate');
  });

  it('fails over when a regeneration at this very position made no progress', () => {
    // Core's `session-regeneration-made-no-progress`: the same position to the
    // millisecond means the last regeneration changed nothing.
    expect(recoveryAfterProbe('gone', 1_900_000.4, 1_900_000)).toBe('failover');
  });

  it('regenerates again once playback has moved on since the last one', () => {
    expect(recoveryAfterProbe('gone', 2_400_000, 1_900_000)).toBe('regenerate');
  });

  it('fails over on a live session, which is a deliberate divergence from core', () => {
    // Core stops here (a live plan's past-end 404), but expo-video hides the
    // status, so this client cannot tell that case apart and fails over.
    expect(recoveryAfterProbe('alive', 1_900_000, undefined)).toBe('failover');
  });

  it('fails over when the probe itself could not be answered', () => {
    expect(recoveryAfterProbe('unreachable', 1_900_000, undefined)).toBe('failover');
    expect(recoveryAfterProbe('unknown-provenance', 1_900_000, undefined)).toBe('failover');
  });
});
