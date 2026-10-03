import { describe, expect, it } from 'vitest';
import { availabilityMarker, mayPlay, nextPlayablePosition } from './availability';

describe('the marker a title shows', () => {
  it('marks partial, unavailable and unknown, and nothing else', () => {
    expect(availabilityMarker({ availability: 'partial' })).toBe('partial');
    expect(availabilityMarker({ availability: 'unavailable' })).toBe('unavailable');
    expect(availabilityMarker({ availability: 'unknown' })).toBe('unknown');
    expect(availabilityMarker({ availability: 'complete' })).toBeUndefined();
    expect(availabilityMarker({})).toBeUndefined();
    expect(availabilityMarker({ availability: 'some-future-code' })).toBeUndefined();
  });
});

describe('what may be played', () => {
  it('holds back only an unavailable title', () => {
    expect(mayPlay({ availability: 'unavailable' })).toBe(false);
    for (const availability of ['partial', 'unknown', 'complete', undefined]) expect(mayPlay({ availability })).toBe(true);
  });

  it('plays a downloaded title off the disk whatever the cluster holds', () => {
    expect(mayPlay({ availability: 'unavailable' }, true)).toBe(true);
  });
});

describe('stepping through a queue past what may not be played', () => {
  const playable = (blocked: number[]) => (position: number) => !blocked.includes(position);

  it('passes over an unavailable title in either direction', () => {
    expect(nextPlayablePosition(5, 1, 1, false, playable([2]))).toBe(3);
    expect(nextPlayablePosition(5, 3, -1, false, playable([2]))).toBe(1);
  });

  it('stops at the end, or goes round it with repeat', () => {
    expect(nextPlayablePosition(4, 2, 1, false, playable([3]))).toBeUndefined();
    expect(nextPlayablePosition(4, 2, 1, true, playable([3]))).toBe(0);
  });

  it('finds nothing where nothing may be played, without looping', () => {
    expect(nextPlayablePosition(3, 0, 1, true, playable([0, 1, 2]))).toBeUndefined();
  });
});
