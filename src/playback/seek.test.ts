import { describe, expect, it } from 'vitest';
import { seekStillPending } from './policy';

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
