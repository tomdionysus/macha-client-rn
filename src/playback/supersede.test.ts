import { describe, expect, it } from 'vitest';
import { endpointFailure, MachaPlaybackError, type PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, selfSupersededGeneration, supersededErrorCheck, updateRefusalMessage } from './policy';

/**
 * The mode-switch hole, which server 0.48.0 turned from latent into routine.
 *
 * Under 0.48.0 a superseded generation answers `410 generation_superseded`
 * with `node_healthy: true` and `alternative_may_succeed: true` — do not walk.
 * expo-video never surfaces the status, so this client cannot classify it and
 * has to know from its own side that it caused the supersession.
 *
 * A rebuilding seek was already covered by the pending-seek guard. A mode
 * switch was not: before the fix `errorBlamesEndpoint` took its `!pendingSeek`
 * branch and returned `true`, so a 410 the client caused fired a failover —
 * and failover on mobile does not work, so that ends playback rather than
 * recovering it.
 *
 * Deadline in these cases: the node states `segmentHoldMs: 6_000` and
 * `SEEK_HOLD_MARGIN_MS` adds 2_000, so the settled tail is 8_000 ms.
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
    // Measured 2026-09-21: a mode-switch PATCH took 15.1s and 16.0s before
    // answering, and a rebuilding seek 12.5s. An in-flight change must not be
    // bounded by a deadline sized for a fragment.
    const inFlight = { startedAtMs: NOW - 16_000 };
    expect(selfSupersededGeneration(inFlight, transformed(), NOW)).toBe(true);
  });

  it('still covers the tail just after the change settles', () => {
    // The player can have a fragment of the old generation in the air across
    // the swap.
    const settled = { startedAtMs: NOW - 20_000, settledAtMs: NOW - 3_000 };
    expect(selfSupersededGeneration(settled, transformed(), NOW)).toBe(true);
  });

  it('stops covering once the node’s own deadline has passed', () => {
    // Narrow on purpose: past this, an error really must blame the endpoint or
    // a dead node leaves the viewer stuck for ever.
    const stale = { startedAtMs: NOW - 30_000, settledAtMs: NOW - 8_000 };
    expect(selfSupersededGeneration(stale, transformed(), NOW)).toBe(false);
  });

  it('covers a switch made from a direct source too', () => {
    // The switch is away from direct, so the source in hand is not a manifest
    // yet. What matters is that this client asked for the change.
    const inFlight = { startedAtMs: NOW - 1_000 };
    expect(selfSupersededGeneration(inFlight, direct(), NOW)).toBe(true);
  });
});

describe('errorBlamesEndpoint with a generation this client superseded', () => {
  it('does not blame the node for a mode switch we asked for', () => {
    // The gap exactly: no seek outstanding, so before the fix this returned
    // true and the client failed over onto a healthy node.
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
    // The existing behaviour must not move: an ordinary mid-playback error
    // with nothing outstanding is still the node's.
    expect(errorBlamesEndpoint(transformed(), undefined, NOW)).toBe(true);
    expect(errorBlamesEndpoint(transformed(), undefined, NOW, undefined)).toBe(true);
  });
});

/**
 * The guard declines the wrong remedy; it must not also swallow the report.
 *
 * **Seen on the A85 twice, the second time on the tagged 0.8.0 from a menu
 * tap.** 2026-09-23 18:31: Remux on a ten-bit HEVC title, PATCH answered, and
 * 1.8 s later the new generation's decoder refused the stream. The error fell
 * inside the settled tail, `failover-declined { reason:
 * 'generation-superseded-by-us' }`, and because a decline counts as handled
 * nothing ever set `failed`: black picture at 0:00, a play button, no message.
 *
 * The guard is right that the node is not to blame. What it cannot know is
 * whether the error was a stale fragment of the old generation (which the
 * swap cures) or the new one failing (which nothing cures). So it waits out
 * the same window it already uses, and whoever is still in error then is told.
 */
describe('supersededErrorCheck', () => {
  it('waits while the PATCH is in flight, and looks again a whole deadline later', () => {
    // The settle time is unknown until the node answers, and a mode switch
    // has taken 16 s to. Re-evaluated when the timer fires.
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
    // The 18:31 run exactly: settled, then an error 1.8 s later, re-examined
    // at the end of the window. Still in error there means the new generation
    // itself cannot play, and the viewer has to hear so.
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
    // Two windows chosen independently is the collision this project keeps
    // paying for. Wherever the guard would still decline, this must wait.
    const settled = { startedAtMs: NOW - 20_000, settledAtMs: NOW - 10_000 };
    for (let at = NOW - 10_000; at <= NOW; at += 250) {
      const declining = !errorBlamesEndpoint(transformed(), undefined, at, settled);
      expect(supersededErrorCheck(settled, transformed(), at).kind).toBe(declining ? 'wait' : 'report');
    }
  });
});

// Built the way core's `throwResponseError` builds them: the prefixed message
// for a log, and the server's own sentence carried separately as `detail`.
const refused = (sentence: string, status = 503, code?: string) =>
  new MachaPlaybackError(`Macha playback request failed: ${sentence}`, status, code, undefined, undefined, sentence);
const viaNode = (inner: unknown) => endpointFailure('https://macnessa.macha.network', 'https://macnessa.macha.network', inner);

describe('updateRefusalMessage', () => {
  it('does not tell a viewer whose film is still playing that it failed', () => {
    // Measured refusal, verbatim from the A85 run.
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
    // Verbatim from the A85 screen, 2026-09-21: the message crossing
    // `endpointFailure` carries both of core's prefixes and a URL the viewer
    // cannot act on.
    const message = updateRefusalMessage(viaNode(refused('timed out waiting for first fragmented-MP4 segment')));
    expect(message).toContain('(timed out waiting for first fragmented-MP4 segment)');
    expect(message).not.toContain('macnessa');
    expect(message).not.toContain('Macha endpoint');
    expect(message).not.toContain('request failed');
  });

  it('does not depend on how core words its prefixes', () => {
    // The day core rewords an envelope, stripping by pattern stops matching
    // and the viewer reads the wrapper again. The detail travels beside the
    // message, so it cannot drift with it.
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
    // A transport failure has no server sentence. Its `.message` is core's log
    // line, node address included; core's rule is that `undefined` detail
    // means the host speaks for itself.
    const message = updateRefusalMessage(viaNode(new TypeError('Network request failed')));
    expect(message).toBe('The node could not change the stream just now. Playback has carried on unchanged.');
  });
});
