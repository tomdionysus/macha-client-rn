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
 * Detects a quality no node can produce at real speed, mirrored from core
 * because this client runs its own failover. Otherwise a source every node
 * transcodes too slowly stalls and fails over back and forth for ever.
 *
 * A failure before `EARLY_STALL_MEDIA_MS` has played, on a node-produced stream
 * (not Direct, where it is the network), fails over once; a second such failure
 * means the limit is shared. Then a viewer-chosen quality stops with the reason;
 * a Play-chosen one steps down to the next lower quality, or stops if none.
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
 * Whether a failed generation means the quality is too slow, and what to do
 * instead of failing over. `playedMs` is undefined if nothing was presented
 * (a source that never started has not stalled). `steps` are highest first.
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

/** Why playback stopped, from the quality and converted streams where known. Worded as the web client's. */
export function tooSlowToPlayText(quality?: QualityClass, transform?: { video: string; audio: string }): string {
  const streams = transform && convertedStreams(transform.video === 'transcode', transform.audio === 'transcode');
  return `Macha can't play ${quality ? qualityLabel(quality) : 'this quality'} because the server can't convert ${streams ?? 'it'} fast enough to keep up.`;
}

/** Play's own choice stepped down to a quality a node keeps up with. Worded as the web client's. */
export function qualitySteppedDownText(quality?: QualityClass): string {
  return `Switched to ${quality ? qualityLabel(quality) : 'a lower quality'}: the server can't convert a higher quality fast enough.`;
}
