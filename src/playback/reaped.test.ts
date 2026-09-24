import { describe, expect, it } from 'vitest';
import {
  endpointFailure,
  MachaPlaybackError,
  REGENERATION_ENDPOINT_GONE_CODE,
  SESSION_PROVENANCE_UNKNOWN_CODE,
} from '@machafoundation/core';
import { classifyProbe, recoveryAfterProbe } from './policy';

/**
 * A reaped session is not the node failing.
 *
 * A viewer pauses past `session_idle` (30 minutes); the node reaps the session,
 * correctly; on resume media3 fetches the next fragment, gets `404`, and the
 * player errors. This client failed over on every player error, and failover
 * starts by charging the endpoint — so the node that answered honestly was
 * dropped and the viewer sent to one that never held the session. Core saw
 * exactly that live on 2026-09-17.
 *
 * expo-video hides the status, so this client asks instead: `sessionAlive` on
 * the owning node, which records nothing against it either way. Which player
 * error gets asked about is decided before this, by waiting out the node's own
 * window (Tom, 2026-09-24, option A) — so an error from a source already
 * replaced never reaches the probe.
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
    // Same node, nothing charged: every other node would answer 404 for a
    // session it never held.
    expect(recoveryAfterProbe('gone', 1_900_000, undefined)).toBe('regenerate');
  });

  it('fails over when a regeneration at this very position made no progress', () => {
    // Core's own bound, `session-regeneration-made-no-progress`: the same
    // position, rounded to the millisecond, means the last regeneration changed
    // nothing and the next step must differ.
    expect(recoveryAfterProbe('gone', 1_900_000.4, 1_900_000)).toBe('failover');
  });

  it('regenerates again once playback has moved on since the last one', () => {
    expect(recoveryAfterProbe('gone', 2_400_000, 1_900_000)).toBe('regenerate');
  });

  it('fails over on a live session, which is a deliberate divergence from core', () => {
    // Core stops there: an alive session answering 404 is a fragment past the
    // end of a live plan. This client cannot tell that case apart, because
    // expo-video hides the status, so a live session with a failing player
    // still fails over — recorded in ACTIVE as a choice.
    expect(recoveryAfterProbe('alive', 1_900_000, undefined)).toBe('failover');
  });

  it('fails over when the probe itself could not be answered', () => {
    expect(recoveryAfterProbe('unreachable', 1_900_000, undefined)).toBe('failover');
    expect(recoveryAfterProbe('unknown-provenance', 1_900_000, undefined)).toBe('failover');
  });
});
