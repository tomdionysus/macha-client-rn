import { describe, expect, it } from 'vitest';
import { restoredVolume } from './policy';

describe('restoredVolume', () => {
  it('restores a ducked player to the intended volume', () => {
    // expo-video's duck is `volume /= 2`, and it overwrites the `userVolume`
    // its own unduck restores from — so nothing else will ever put this back.
    expect(restoredVolume(0.5, 1)).toBe(1);
  });

  it('restores from a compounded duck rather than stepping back one level', () => {
    // Three interruptions. Halving again from 0.125 is the bug, not the fix.
    expect(restoredVolume(0.125, 1)).toBe(1);
  });

  it('leaves an already-correct volume alone, so the write cannot loop', () => {
    // The caller writes `player.volume`, which emits another volumeChange.
    expect(restoredVolume(1, 1)).toBeUndefined();
  });

  it('never lowers a player that is louder than intended', () => {
    expect(restoredVolume(1, 0.5)).toBeUndefined();
  });
});
