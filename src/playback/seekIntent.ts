import type { PlaybackSession } from '@machafoundation/core';
import { generationOriginMs, seekRequiresReposition } from './policy';

/**
 * A seek as core's coordinator makes it (`seek`, `seekBy`, `onPlayerEvent`),
 * mirrored because this client drives the resolver itself.
 *
 * The target is pinned when the viewer seeks and shown on the bar until the
 * requested stream is presented and tracking; the outgoing stream keeps
 * playing meanwhile and would make the bar jump. Successive seeks build on the
 * target, so three back-tens go back thirty.
 */
export interface SeekIntent {
  /** Where the viewer asked to be, on the title's timeline. */
  targetMs: number;
  /**
   * The stream serving the target is on the player: at once for a seek within
   * the playing generation, else once the node answers. Reports before that are
   * the outgoing stream's.
   */
  presented: boolean;
  /** The last report since presentation that did not reach the target. */
  lastReportedMs?: number;
}

/** Close enough to the target to count as arrived: core's figure. */
export const SEEK_REACHED_TOLERANCE_MS = 1_500;

/**
 * Debounce before a seek needing a new generation asks the node, so a burst of
 * presses becomes one request: core's `UNCACHED_SEEK_DEBOUNCE_MS`.
 */
export const UNCACHED_SEEK_DEBOUNCE_MS = 300;

/** Where a further seek starts from: the target while one is pinned, else the playhead. */
export function seekBase(intent: SeekIntent | undefined, positionMs: number): number {
  return intent ? intent.targetMs : positionMs;
}

/**
 * A player report against a pinned seek: the intent still pinned, or undefined once released.
 *
 * Released when a report reaches the target, or, once presented, after two
 * consecutive reports that moved (the player may settle near the target, at a
 * random-access point). Never released on movement before presentation: that
 * is the outgoing stream, and releasing would snap the bar back.
 */
export function observeSeek(intent: SeekIntent, reportedMs: number): SeekIntent | undefined {
  if (Math.abs(reportedMs - intent.targetMs) <= SEEK_REACHED_TOLERANCE_MS) return undefined;
  if (!intent.presented) return intent;
  if (intent.lastReportedMs !== undefined && reportedMs !== intent.lastReportedMs) return undefined;
  return { ...intent, lastReportedMs: reportedMs };
}

/**
 * Whether the player can serve a seek from its current generation (and where
 * on that generation's timeline), or the node must build a new one.
 *
 * Both directions: nothing before a transformed generation's origin exists, so
 * a seek back past it repositions (as core's `generationLocalPosition`); ahead,
 * the bound is the buffered end. Downloads and Direct play are always local.
 */
export function seekPlan(
  session: PlaybackSession | undefined,
  targetMs: number,
  bufferedEndMs: number,
): { kind: 'local'; localMs: number } | { kind: 'reposition' } {
  if (!session || !session.source.isManifest) return { kind: 'local', localMs: targetMs };
  const originMs = generationOriginMs(session);
  // To the millisecond, as the wire carries it (core `generationLocalPosition`).
  if (Math.round(targetMs) < originMs) return { kind: 'reposition' };
  if (seekRequiresReposition(session, targetMs, bufferedEndMs)) return { kind: 'reposition' };
  return { kind: 'local', localMs: targetMs - originMs };
}
