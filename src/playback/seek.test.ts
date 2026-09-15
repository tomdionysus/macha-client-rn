import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { errorBlamesEndpoint, seekRequiresReposition, seekStillPending } from './policy';

const pending = { targetMs: 600_000, atMs: 1_000 };

describe('seekStillPending', () => {
  it('ignores the position the player was at before the seek', () => {
    // The scrubber fighting the viewer: released at ten minutes, and the next
    // timeUpdate still reports the two-minute mark it was playing from.
    expect(seekStillPending(pending, 120_000, 1_100)).toBe(true);
  });

  it('accepts the keyframe the node actually settled on', () => {
    // A transformed stream lands near the target, not on it.
    expect(seekStillPending(pending, 599_200, 1_100)).toBe(false);
  });

  it('accepts playback continuing on from the target', () => {
    expect(seekStillPending(pending, 601_000, 1_500)).toBe(false);
  });

  it('believes the player again once the seek has clearly not landed', () => {
    // Otherwise a seek that never arrives freezes the position for good, which
    // is worse than the snap-back it was added to prevent.
    expect(seekStillPending(pending, 120_000, 1_000 + 6_000)).toBe(false);
  });

  it('still ignores a stale report just before the deadline', () => {
    expect(seekStillPending(pending, 120_000, 1_000 + 5_999)).toBe(true);
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
    // Beyond SEEK_DEADLINE_MS the seek is no longer a credible explanation.
    expect(errorBlamesEndpoint(transformed(), { targetMs: 3_600_000, atMs: 1_000 }, 1_000 + 6_000)).toBe(true);
  });

  it('blames the node for direct play regardless of a seek', () => {
    expect(errorBlamesEndpoint(direct(), { targetMs: 3_600_000, atMs: 1_000 }, 1_100)).toBe(true);
  });

  it('blames the node when there is no session to excuse', () => {
    expect(errorBlamesEndpoint(undefined, { targetMs: 1, atMs: 1_000 }, 1_100)).toBe(true);
  });
});
