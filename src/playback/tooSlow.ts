import {
  EARLY_STALL_MEDIA_MS,
  qualityLabel,
  type PlaybackSession,
  type QualityClass,
  type VersionStep,
} from '@machafoundation/core';
import { convertedStreams } from './quality';
import type { PlaybackChoice } from './resume';

/**
 * A quality no node can produce at real speed (core `d1069d2`), mirrored
 * here because this client runs its own failover rather than core's
 * coordinator.
 *
 * The web client, 2026-09-28: The Martian's 4K HEVC ten-bit source
 * transcodes at about 0.33x on both nodes, so each delivered its first
 * fragment and stalled, and failover went back and forth for ever with the
 * viewer at 0:02 and no word why. A failure before the generation has played
 * `EARLY_STALL_MEDIA_MS`, on a stream the node is producing (not Direct,
 * where it is the network), fails over once as before; if the replacement
 * fails the same way, the second node shares the limit and another would too.
 *
 * Then, Tom, 2026-09-28: a quality the viewer chose stops, with the reason
 * and a way to try again. A quality Play chose steps down to the next lower
 * one and says so; with none lower, it stops the same way.
 */

/** The failures counted so far against one file, mode and cap. */
export interface EarlyStalls {
  key?: string;
  count: number;
}

export type TooSlowVerdict =
  | { kind: 'keeps-up' }
  | { kind: 'stop' }
  | { kind: 'step-down'; step: VersionStep };

/**
 * Whether a failed generation means the quality is too slow to play, and
 * what to do instead of failing over.
 *
 * `playedMs` is how much of the failed generation played, undefined where
 * nothing of it was ever presented: a source that never started has not
 * stalled. `steps` are the item's qualities, highest first.
 */
export function tooSlowToPlay(
  stalls: EarlyStalls,
  session: Pick<PlaybackSession, 'mode' | 'mediaId' | 'preferences'>,
  playedMs: number | undefined,
  choice: PlaybackChoice,
  steps: readonly VersionStep[],
): { stalls: EarlyStalls; verdict: TooSlowVerdict } {
  const keepsUp = { kind: 'keeps-up' } as const;
  if (session.mode === 'direct' || playedMs === undefined) return { stalls, verdict: keepsUp };
  if (playedMs >= EARLY_STALL_MEDIA_MS) return { stalls: { count: 0 }, verdict: keepsUp };
  const key = `${session.mediaId ?? ''}|${session.mode}|${session.preferences.maxHeight ?? ''}`;
  const count = (key === stalls.key ? stalls.count : 0) + 1;
  if (count < 2) return { stalls: { key, count }, verdict: keepsUp };
  const { quality } = choice;
  const lower = !choice.chosenByViewer && quality !== undefined ? steps.find((step) => step.quality < quality) : undefined;
  return { stalls: { key, count: 0 }, verdict: lower ? { kind: 'step-down', step: lower } : { kind: 'stop' } };
}

/**
 * Why playback stopped, from the facts where they are known: the quality,
 * and which streams the session converts. Tom: "clear, concise, and visible
 * 'Macha can't play this quality because...'". The web's `tooSlowToPlayText`
 * word for word (web `e543e0e`).
 */
export function tooSlowToPlayText(quality?: QualityClass, transform?: { video: string; audio: string }): string {
  const streams = transform && convertedStreams(transform.video === 'transcode', transform.audio === 'transcode');
  return `Macha can't play ${quality ? qualityLabel(quality) : 'this quality'} because the server can't convert ${streams ?? 'it'} fast enough to keep up.`;
}

/** Play's own choice stepped down to a quality a node keeps up with. The web's `qualitySteppedDownText`. */
export function qualitySteppedDownText(quality?: QualityClass): string {
  return `Switched to ${quality ? qualityLabel(quality) : 'a lower quality'}: the server can't convert a higher quality fast enough.`;
}
