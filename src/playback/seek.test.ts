import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, seekRequiresReposition, seekStillPending } from './policy';

const pending = { targetMs: 600_000, atMs: 1_000 };

// A downloaded original played from disk: no node, so the published floor bounds the wait.
const noSession = undefined;

describe('seekStillPending', () => {
  it('ignores the position the player was at before the seek', () => {
    // Released at ten minutes, the next timeUpdate still reports two minutes.
    expect(seekStillPending(noSession, pending, 120_000, 1_100)).toBe(true);
  });

  it('accepts the keyframe the node actually settled on', () => {
    // A transformed stream lands near the target, not on it.
    expect(seekStillPending(noSession, pending, 599_200, 1_100)).toBe(false);
  });

  it('accepts playback continuing on from the target', () => {
    expect(seekStillPending(noSession, pending, 601_000, 1_500)).toBe(false);
  });

  it('believes the player again once the seek has clearly not landed', () => {
    // Otherwise a seek that never arrives freezes the position for good.
    expect(seekStillPending(noSession, pending, 120_000, 1_000 + 8_000)).toBe(false);
  });

  it('still ignores a stale report just before the deadline', () => {
    expect(seekStillPending(noSession, pending, 120_000, 1_000 + 7_999)).toBe(true);
  });
});

describe('seekRequiresReposition', () => {
  const transformed = (overrides = {}) =>
    ({ source: { isManifest: true }, ...overrides }) as unknown as PlaybackSession;
  const direct = () => ({ source: { isManifest: false } }) as unknown as PlaybackSession;

// Far past production the node refuses with beyond_hold_window, media3
// treats that as fatal, and the error reads as a bad node.
  it('repositions a transformed generation for a seek past what is buffered', () => {
    expect(seekRequiresReposition(transformed(), 3_600_000, 120_000)).toBe(true);
  });

  it('leaves a seek inside the buffer alone', () => {
    expect(seekRequiresReposition(transformed(), 90_000, 120_000)).toBe(false);
    expect(seekRequiresReposition(transformed(), 120_000, 120_000)).toBe(false);
  });

// Nothing buffered is not evidence that anything has been produced.
  it('treats an empty buffer as nothing produced', () => {
    expect(seekRequiresReposition(transformed(), 1, 0)).toBe(true);
  });

  // Direct play is a byte range over a complete file: every offset exists.
  it('never repositions direct play', () => {
    expect(seekRequiresReposition(direct(), 3_600_000, 0)).toBe(false);
  });

  // A downloaded original has no node and no generation.
  it('never repositions without a session', () => {
    expect(seekRequiresReposition(undefined, 3_600_000, 0)).toBe(false);
  });

// Backward seeks are left alone: nothing establishes they fall outside the window.
  it('does not act on backward seeks', () => {
    expect(seekRequiresReposition(transformed(), 10_000, 120_000)).toBe(false);
  });
});

describe('errorBlamesEndpoint', () => {
  const transformed = () => ({ source: { isManifest: true } }) as unknown as PlaybackSession;
  const direct = () => ({ source: { isManifest: false } }) as unknown as PlaybackSession;

// A fatal error shortly after our own seek, on a healthy node, must not fail over.
  it('does not blame the node for an error under an outstanding seek', () => {
    expect(errorBlamesEndpoint(transformed(), { targetMs: 3_600_000, atMs: 1_000 }, 5_700)).toBe(false);
  });

// Failover must still work for ordinary playback failures.
  it('blames the node when no seek is outstanding', () => {
    expect(errorBlamesEndpoint(transformed(), undefined, 5_700)).toBe(true);
  });

  it('blames the node once the seek deadline has passed', () => {
    // Past the node's hold plus margin, the error is the endpoint's again.
    expect(errorBlamesEndpoint(transformed(), { targetMs: 3_600_000, atMs: 1_000 }, 1_000 + 8_000)).toBe(true);
  });

  it('blames the node for direct play regardless of a seek', () => {
    expect(errorBlamesEndpoint(direct(), { targetMs: 3_600_000, atMs: 1_000 }, 1_100)).toBe(true);
  });

  it('blames the node when there is no session to excuse', () => {
    expect(errorBlamesEndpoint(undefined, { targetMs: 1, atMs: 1_000 }, 1_100)).toBe(true);
  });
});

// The excuse window is the serving node's own hold, not a copy of the published default.
describe('the seek window against the node that stated it', () => {
  const held = (segmentHoldMs: number) =>
    ({ source: { isManifest: true, budgets: { deadlineMs: 30_000, segmentHoldMs } } }) as unknown as PlaybackSession;
// No `budgets` (older node, or status not yet loaded): the published floor applies.
  const unstated = () => ({ source: { isManifest: true } }) as unknown as PlaybackSession;
  const seek = { targetMs: 3_600_000, atMs: 1_000 };

  it('excuses an error for as long as the node says it holds a fragment', () => {
    // A node holding for ten seconds is producing, not failing.
    expect(errorBlamesEndpoint(held(10_000), seek, 1_000 + 9_000)).toBe(false);
  });

  it('stops excusing once the node itself would have answered', () => {
    expect(errorBlamesEndpoint(held(10_000), seek, 1_000 + 12_001)).toBe(true);
  });

  it('follows a node that holds for less, rather than excusing it for six seconds', () => {
    // A two-second hold excused for six would read four seconds of a dead node as our seek.
    expect(errorBlamesEndpoint(held(2_000), seek, 1_000 + 5_000)).toBe(true);
  });

  it('allows the player its retry and first byte above the hold', () => {
    // A seek can land a hold *plus* transport later; the hold alone would blame the node at 6_001.
    expect(errorBlamesEndpoint(unstated(), seek, 1_000 + 7_000)).toBe(false);
  });

  it('falls back to the published hold for a node too old to state one', () => {
    expect(errorBlamesEndpoint(unstated(), seek, 1_000 + 8_000)).toBe(true);
  });

// Both windows derive from the same figure so believing the player and blaming
// the node cannot drift apart.
  it('times a pending seek out on the same window it excuses an error for', () => {
    expect(seekStillPending(held(10_000), { ...seek, targetMs: 600_000 }, 120_000, 1_000 + 9_000)).toBe(true);
    expect(seekStillPending(held(10_000), { ...seek, targetMs: 600_000 }, 120_000, 1_000 + 12_000)).toBe(false);
  });
});
