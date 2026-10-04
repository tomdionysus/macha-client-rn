import { availableToPlay } from '@machafoundation/core';
import type { MediaSummary } from '../types';

/**
 * The availability marker a title shows, shared by every client: `partial`
 * (yellow triangle), `unavailable` (red crossed circle; greyed, not selectable,
 * the only one not playable), `unknown` (yellow question mark), none for
 * `complete`. A downloaded title is complete whatever the server says. Codes
 * describe which nodes hold the pieces, not that the bytes read back; an
 * absent or unrecognised code shows no marker.
 */
export type AvailabilityMarker = 'partial' | 'unavailable' | 'unknown';

export function availabilityMarker(item: Pick<MediaSummary, 'availability'>, downloaded = false): AvailabilityMarker | undefined {
  if (downloaded) return undefined;
  switch (item.availability) {
    case 'partial': return 'partial';
    case 'unavailable': return 'unavailable';
    case 'unknown': return 'unknown';
    default: return undefined;
  }
}

/** Whether a title may be played or opened: core's `availableToPlay`, or downloaded. */
export function mayPlay(item: Pick<MediaSummary, 'availability'>, downloaded = false): boolean {
  return downloaded || availableToPlay(item);
}

/**
 * The next position in the play order, `delta` steps on, skipping unplayable
 * titles; undefined if none remains. `wrap` goes round the ends (repeat-all),
 * visiting each position at most once.
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
