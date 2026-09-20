import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, seekRequiresReposition, seekStillPending } from './policy';

const pending = { targetMs: 600_000, atMs: 1_000 };

// A downloaded original played off the disk: no node, no stated hold, and the
// published floor is what bounds the wait.
const noSession = undefined;

describe('seekStillPending', () => {
  it('ignores the position the player was at before the seek', () => {
    // The scrubber fighting the viewer: released at ten minutes, and the next
    // timeUpdate still reports the two-minute mark it was playing from.
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
    // Otherwise a seek that never arrives freezes the position for good, which
    // is worse than the snap-back it was added to prevent.
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

  // The measured defect: an hour into a 2:43 film is hundreds of segments past
  // production, refused immediately as beyond_hold_window, fatal on first
  // occurrence in media3, and read by this client as a bad node.
  it('repositions a transformed generation for a seek past what is buffered', () => {
    expect(seekRequiresReposition(transformed(), 3_600_000, 120_000)).toBe(true);
  });

  it('leaves a seek inside the buffer alone', () => {
    expect(seekRequiresReposition(transformed(), 90_000, 120_000)).toBe(false);
    expect(seekRequiresReposition(transformed(), 120_000, 120_000)).toBe(false);
  });

  // Nothing buffered yet is not evidence that anything has been produced, and
  // guessing otherwise is how the node gets asked for a segment nobody is building.
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

  // Backward seeks are deliberately untouched: a bounded window implies they
  // could also fall outside it, but that has not been measured and guessing
  // about the server is what produced the defect in the first place.
  it('does not act on backward seeks', () => {
    expect(seekRequiresReposition(transformed(), 10_000, 120_000)).toBe(false);
  });
});

describe('errorBlamesEndpoint', () => {
  const transformed = () => ({ source: { isManifest: true } }) as unknown as PlaybackSession;
  const direct = () => ({ source: { isManifest: false } }) as unknown as PlaybackSession;

  // The measured case: fatal error 4.7s after our own seek, node perfectly
  // healthy, and this client stopped the session and rebuilt elsewhere.
  it('does not blame the node for an error under an outstanding seek', () => {
    expect(errorBlamesEndpoint(transformed(), { targetMs: 3_600_000, atMs: 1_000 }, 5_700)).toBe(false);
  });

  // Failover must still work. A transformed stream failing in ordinary playback
  // is precisely what it exists for, and this must not become a blanket excuse.
  it('blames the node when no seek is outstanding', () => {
    expect(errorBlamesEndpoint(transformed(), undefined, 5_700)).toBe(true);
  });

  it('blames the node once the seek deadline has passed', () => {
    // Past the node's hold and the margin above it, the seek is no longer a
    // credible explanation and an error is the endpoint's again.
    expect(errorBlamesEndpoint(transformed(), { targetMs: 3_600_000, atMs: 1_000 }, 1_000 + 8_000)).toBe(true);
  });

  it('blames the node for direct play regardless of a seek', () => {
    expect(errorBlamesEndpoint(direct(), { targetMs: 3_600_000, atMs: 1_000 }, 1_100)).toBe(true);
  });

  it('blames the node when there is no session to excuse', () => {
    expect(errorBlamesEndpoint(undefined, { targetMs: 1, atMs: 1_000 }, 1_100)).toBe(true);
  });
});

// The window an outstanding seek excuses an error for has to be the serving
// node's own hold, not a copy of the published default. `SEEK_DEADLINE_MS` was
// chosen here at 6_000 without reference to the server, and happened to equal
// it — the fifth entry in core's table of two independently chosen constants
// that had to relate and did not.
describe('the seek window against the node that stated it', () => {
  const held = (segmentHoldMs: number) =>
    ({ source: { isManifest: true, budgets: { deadlineMs: 30_000, segmentHoldMs } } }) as unknown as PlaybackSession;
  // A node too old to report its budgets, or one whose status call has not
  // landed: `budgets` is absent and the published floor applies.
  const unstated = () => ({ source: { isManifest: true } }) as unknown as PlaybackSession;
  const seek = { targetMs: 3_600_000, atMs: 1_000 };

  it('excuses an error for as long as the node says it holds a fragment', () => {
    // A node holding for ten seconds is producing, not failing, and a seek
    // landing at nine is inside its own entitlement.
    expect(errorBlamesEndpoint(held(10_000), seek, 1_000 + 9_000)).toBe(false);
  });

  it('stops excusing once the node itself would have answered', () => {
    expect(errorBlamesEndpoint(held(10_000), seek, 1_000 + 12_001)).toBe(true);
  });

  it('follows a node that holds for less, rather than excusing it for six seconds', () => {
    // The direction that costs a viewer: a two-second hold excused for six is
    // four seconds of a genuinely dead node read as our own outstanding seek.
    expect(errorBlamesEndpoint(held(2_000), seek, 1_000 + 5_000)).toBe(true);
  });

  it('allows the player its retry and first byte above the hold', () => {
    // 6_000 exactly was the bug: a seek can legitimately land a hold *plus*
    // transport later, and at 6_001 the next error was charged to the node.
    expect(errorBlamesEndpoint(unstated(), seek, 1_000 + 7_000)).toBe(false);
  });

  it('falls back to the published hold for a node too old to state one', () => {
    expect(errorBlamesEndpoint(unstated(), seek, 1_000 + 8_000)).toBe(true);
  });

  // Both windows come off the same figure deliberately. They answer different
  // questions — when to believe the player, and when to blame the node — but a
  // seek that is still credible to one and expired to the other is the drift
  // this whole item exists to remove.
  it('times a pending seek out on the same window it excuses an error for', () => {
    expect(seekStillPending(held(10_000), { ...seek, targetMs: 600_000 }, 120_000, 1_000 + 9_000)).toBe(true);
    expect(seekStillPending(held(10_000), { ...seek, targetMs: 600_000 }, 120_000, 1_000 + 12_000)).toBe(false);
  });
});
