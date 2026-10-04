import { describe, expect, it } from 'vitest';
import { endpointFailure, MachaPlaybackError, type PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, selfSupersededGeneration, supersededErrorCheck, updateRefusalMessage } from './policy';

/**
 * A generation this client superseded with a mode switch answers
 * `410 generation_superseded` from a healthy node. expo-video hides the
 * status, so the client must know it caused the supersession; failing over
 * instead would end playback. Rebuilding seeks are covered by the pending-seek guard.
 *
 * Deadline here: `segmentHoldMs` 6_000 + `SEEK_HOLD_MARGIN_MS` 2_000 = 8_000 ms.
 */

const transformed = () =>
  ({ source: { isManifest: true, budgets: { segmentHoldMs: 6_000 } } }) as unknown as PlaybackSession;
const direct = () => ({ source: { isManifest: false } }) as unknown as PlaybackSession;

const NOW = 1_000_000;

describe('selfSupersededGeneration', () => {
  it('is false when this client has changed nothing', () => {
    expect(selfSupersededGeneration(undefined, transformed(), NOW)).toBe(false);
  });

  it('is true while the PATCH is still in flight, however long it takes', () => {
    // A mode-switch PATCH can take 16 s; in flight is not bounded by a fragment deadline.
    const inFlight = { startedAtMs: NOW - 16_000 };
    expect(selfSupersededGeneration(inFlight, transformed(), NOW)).toBe(true);
  });

  it('still covers the tail just after the change settles', () => {
    // An old-generation fragment can be in the air across the swap.
    const settled = { startedAtMs: NOW - 20_000, settledAtMs: NOW - 3_000 };
    expect(selfSupersededGeneration(settled, transformed(), NOW)).toBe(true);
  });

  it('stops covering once the node’s own deadline has passed', () => {
    // Narrow on purpose, or a dead node strands the viewer.
    const stale = { startedAtMs: NOW - 30_000, settledAtMs: NOW - 8_000 };
    expect(selfSupersededGeneration(stale, transformed(), NOW)).toBe(false);
  });

  it('covers a switch made from a direct source too', () => {
    // Switching away from direct: what matters is that this client asked.
    const inFlight = { startedAtMs: NOW - 1_000 };
    expect(selfSupersededGeneration(inFlight, direct(), NOW)).toBe(true);
  });
});

describe('errorBlamesEndpoint with a generation this client superseded', () => {
  it('does not blame the node for a mode switch we asked for', () => {
    // No seek outstanding: only the in-flight change prevents failover.
    expect(errorBlamesEndpoint(transformed(), undefined, NOW, { startedAtMs: NOW - 2_000 })).toBe(false);
  });

  it('does not blame the node in the tail after the switch settles', () => {
    const settled = { startedAtMs: NOW - 20_000, settledAtMs: NOW - 1_000 };
    expect(errorBlamesEndpoint(transformed(), undefined, NOW, settled)).toBe(false);
  });

  it('blames the endpoint again once the window has closed', () => {
    const stale = { startedAtMs: NOW - 40_000, settledAtMs: NOW - 9_000 };
    expect(errorBlamesEndpoint(transformed(), undefined, NOW, stale)).toBe(true);
  });

  it('is unchanged when no generation change is outstanding', () => {
    // An ordinary mid-playback error with nothing outstanding is the node's.
    expect(errorBlamesEndpoint(transformed(), undefined, NOW)).toBe(true);
    expect(errorBlamesEndpoint(transformed(), undefined, NOW, undefined)).toBe(true);
  });
});

/**
 * The guard declines the wrong remedy but must not swallow the report: a new
 * generation the decoder refuses inside the tail (e.g. Remux of ten-bit HEVC)
 * would otherwise leave a black picture and no message. It waits out the same
 * window, then reports if still in error.
 */
describe('supersededErrorCheck', () => {
  it('waits while the PATCH is in flight, and looks again a whole deadline later', () => {
    // Settle time is unknown until the node answers.
    expect(supersededErrorCheck({ startedAtMs: NOW - 2_000 }, transformed(), NOW)).toEqual({
      kind: 'wait',
      recheckAtMs: NOW + 8_000,
    });
  });

  it('waits out the settled tail, and no longer than it', () => {
    const settled = { startedAtMs: NOW - 3_000, settledAtMs: NOW - 1_800 };
    expect(supersededErrorCheck(settled, transformed(), NOW)).toEqual({
      kind: 'wait',
      recheckAtMs: NOW - 1_800 + 8_000,
    });
  });

  it('reports the A85 case once the tail has closed', () => {
    // Still in error at the end of the window: the new generation cannot play.
    const settledAtMs = NOW - 1_800;
    const atDeadline = settledAtMs + 8_000;
    expect(supersededErrorCheck({ startedAtMs: NOW - 3_000, settledAtMs }, transformed(), atDeadline)).toEqual({
      kind: 'report',
    });
  });

  it('reports when there is no change of ours to wait for', () => {
    expect(supersededErrorCheck(undefined, transformed(), NOW)).toEqual({ kind: 'report' });
  });

  it('uses the same window the guard does, so it never reports inside it', () => {
    // Wherever the guard still declines, this must wait.
    const settled = { startedAtMs: NOW - 20_000, settledAtMs: NOW - 10_000 };
    for (let at = NOW - 10_000; at <= NOW; at += 250) {
      const declining = !errorBlamesEndpoint(transformed(), undefined, at, settled);
      expect(supersededErrorCheck(settled, transformed(), at).kind).toBe(declining ? 'wait' : 'report');
    }
  });
});

// As core's `throwResponseError` builds them: a prefixed log message, with the server's sentence as `detail`.
const refused = (sentence: string, status = 503, code?: string) =>
  new MachaPlaybackError(`Macha playback request failed: ${sentence}`, status, code, undefined, undefined, sentence);
const viaNode = (inner: unknown) => endpointFailure('https://macnessa.macha.network', 'https://macnessa.macha.network', inner);

describe('updateRefusalMessage', () => {
  it('does not tell a viewer whose film is still playing that it failed', () => {
    const message = updateRefusalMessage(refused('video transcode limit reached', 429, 'resource_limit'));
    expect(message).toContain('carried on unchanged');
    expect(message).not.toMatch(/^Macha playback request failed/);
    // The node's reason is the only place it appears, so it is kept.
    expect(message).toContain('video transcode limit reached');
  });

  it('keeps the remux timeout reason too', () => {
    const error = refused('timed out waiting for first fragmented-MP4 segment', 503, 'playback_pipeline_start_failed');
    expect(updateRefusalMessage(error)).toContain('timed out waiting for first fragmented-MP4 segment');
  });

  it('stands alone when there is no detail to quote', () => {
    expect(updateRefusalMessage({})).toBe('The node could not change the stream just now. Playback has carried on unchanged.');
  });
});

describe('updateRefusalMessage detail, as it actually arrives', () => {
  it('quotes the node through core’s nested envelopes, and not the hostname with them', () => {
    // Crossing `endpointFailure` adds both core prefixes and a node URL.
    const message = updateRefusalMessage(viaNode(refused('timed out waiting for first fragmented-MP4 segment')));
    expect(message).toContain('(timed out waiting for first fragmented-MP4 segment)');
    expect(message).not.toContain('macnessa');
    expect(message).not.toContain('Macha endpoint');
    expect(message).not.toContain('request failed');
  });

  it('does not depend on how core words its prefixes', () => {
    // `detail` travels beside the message, so rewording an envelope cannot leak it.
    const reworded = new MachaPlaybackError(
      'Macha playback refused (503): timed out waiting for first fragmented-MP4 segment',
      503,
      'playback_pipeline_start_failed',
      undefined,
      undefined,
      'timed out waiting for first fragmented-MP4 segment',
    );
    const message = updateRefusalMessage(viaNode(reworded));
    expect(message).toBe(
      'The node could not change the stream just now. Playback has carried on unchanged. (timed out waiting for first fragmented-MP4 segment)',
    );
  });

  it('says its own sentence when no layer stated one, rather than quoting a log line', () => {
    // No server sentence: undefined detail means the client speaks for itself, never `.message`.
    const message = updateRefusalMessage(viaNode(new TypeError('Network request failed')));
    expect(message).toBe('The node could not change the stream just now. Playback has carried on unchanged.');
  });
});
