import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, selfSupersededGeneration, updateRefusalMessage } from './policy';

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

describe('updateRefusalMessage', () => {
  it('does not tell a viewer whose film is still playing that it failed', () => {
    // Measured refusal, verbatim from the A85 run.
    const error = new Error('Macha playback request failed: video transcode limit reached');
    const message = updateRefusalMessage(error);
    expect(message).toContain('carried on unchanged');
    expect(message).not.toMatch(/^Macha playback request failed/);
    // The node's reason is the only place it appears, so it is kept.
    expect(message).toContain('video transcode limit reached');
  });

  it('keeps the remux timeout reason too', () => {
    const error = new Error('Macha playback request failed: timed out waiting for first fragmented-MP4 segment');
    expect(updateRefusalMessage(error)).toContain('timed out waiting for first fragmented-MP4 segment');
  });

  it('stands alone when there is no detail to quote', () => {
    expect(updateRefusalMessage({})).toBe('The node could not change the stream just now. Playback has carried on unchanged.');
  });
});

describe('updateRefusalMessage detail, as it actually arrives', () => {
  it('strips core’s nested envelopes and the node hostname with them', () => {
    // Verbatim from the A85 screen, 2026-09-21: stripping a single prefix left
    // the viewer reading the other one and a URL they cannot act on.
    const error = new Error(
      'Macha endpoint https://macnessa.macha.network failed: Macha playback request failed: timed out waiting for first fragmented-MP4 segment',
    );
    const message = updateRefusalMessage(error);
    expect(message).toContain('(timed out waiting for first fragmented-MP4 segment)');
    expect(message).not.toContain('macnessa');
    expect(message).not.toContain('Macha endpoint');
    expect(message).not.toContain('request failed');
  });
});
