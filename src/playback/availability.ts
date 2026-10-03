import { availableToPlay } from '@machafoundation/core';
import type { MediaSummary } from '../types';

/**
 * How a title shows how much of it the reachable cluster holds, as every
 * client shows it (Tom's ruling): outline icons, a yellow warning triangle for
 * `partial`, a red crossed circle for `unavailable` with the title greyed and
 * not selectable, a yellow question mark for `unknown`, and nothing for
 * `complete`. Only `unavailable` may not be played.
 *
 * The codes are facts about which nodes hold the pieces, not a promise the
 * bytes read back; an absent code (an older server) and any code this does
 * not name show no marker.
 */
export type AvailabilityMarker = 'partial' | 'unavailable' | 'unknown';

export function availabilityMarker(item: Pick<MediaSummary, 'availability'>): AvailabilityMarker | undefined {
  switch (item.availability) {
    case 'partial': return 'partial';
    case 'unavailable': return 'unavailable';
    case 'unknown': return 'unknown';
    default: return undefined;
  }
}

/**
 * Whether a title may be played or opened: core's `availableToPlay`, the rule
 * every client follows, except that a downloaded title plays off the disk
 * whatever the cluster holds, so it is never held back.
 */
export function mayPlay(item: Pick<MediaSummary, 'availability'>, downloaded = false): boolean {
  return downloaded || availableToPlay(item);
}

/**
 * The next position in the play order, `delta` steps on, passing over titles
 * that may not be played; undefined where none remains. `wrap` goes round
 * the ends, as repeat-all does, and visits each position at most once.
 */
export function nextPlayablePosition(
  length: number,
  from: number,
  delta: number,
  wrap: boolean,
  playableAt: (position: number) => boolean,
): number | undefined {
  const step = delta < 0 ? -1 : 1;
  let position = from + delta;
  for (let visited = 0; visited < length; visited += 1) {
    if (position < 0 || position >= length) {
      if (!wrap) return undefined;
      position = (position + length) % length;
    }
    if (playableAt(position)) return position;
    position += step;
  }
  return undefined;
}
