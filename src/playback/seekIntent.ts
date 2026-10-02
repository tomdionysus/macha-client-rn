import type { PlaybackSession } from '@machafoundation/core';
import { generationOriginMs, seekRequiresReposition } from './policy';

/**
 * A seek as the web client makes it, through core's coordinator (`seek`,
 * `seekBy`, `onPlayerEvent`), mirrored here because this client drives the
 * resolver itself. It must behave exactly as the web client's does.
 *
 * **The target is pinned the moment the viewer seeks**, and the bar shows it
 * until the stream asked for is on the player and has shown it is tracking.
 * The outgoing stream plays on while the node builds the new one, so a bar
 * that followed it would make a seek back read as a seek forward, then jump.
 *
 * **Successive seeks build on the target, not on the outgoing stream**, so
 * three presses of back-ten go back thirty.
 */
export interface SeekIntent {
  /** Where the viewer asked to be, on the title's timeline. */
  targetMs: number;
  /**
   * The stream that serves the target is on the player: at once for a seek
   * within the playing generation, once the node answers for a new one.
   * Until then every report is the outgoing stream's and says nothing.
   */
  presented: boolean;
  /** The last report since presentation that did not reach the target. */
  lastReportedMs?: number;
}

/** Close enough to the target to count as arrived: core's figure. */
export const SEEK_REACHED_TOLERANCE_MS = 1_500;

/**
 * How long a seek needing a new generation waits for the next one before
 * asking the node: core's `UNCACHED_SEEK_DEBOUNCE_MS`. Presses in a burst
 * become one request, for the last target.
 */
export const UNCACHED_SEEK_DEBOUNCE_MS = 300;

/** Where a further seek starts from: the target while one is pinned, else the playhead. */
export function seekBase(intent: SeekIntent | undefined, positionMs: number): number {
  return intent ? intent.targetMs : positionMs;
}

/**
 * A player report against a pinned seek: the intent still pinned, or
 * undefined once released.
 *
 * Released when the report reaches the target; or, once the stream asked
 * for is presented, by two reports in a row that moved, because a player can
 * settle somewhere near the target rather than on it (a transformed
 * generation starts at a random-access point) and the pin must not outlive
 * that. Never on movement before presentation: the outgoing stream is still
 * playing and still moving, and releasing on it snaps the bar back.
 */
export function observeSeek(intent: SeekIntent, reportedMs: number): SeekIntent | undefined {
  if (Math.abs(reportedMs - intent.targetMs) <= SEEK_REACHED_TOLERANCE_MS) return undefined;
  if (!intent.presented) return intent;
  if (intent.lastReportedMs !== undefined && reportedMs !== intent.lastReportedMs) return undefined;
  return { ...intent, lastReportedMs: reportedMs };
}

/**
 * Whether a seek can be served by the player from the generation it holds,
 * and where on that generation's own timeline, or needs the node to build a
 * new one.
 *
 * **Both directions.** A transformed generation begins where it was asked
 * for, and nothing before that exists in it: a seek back past its origin, clamped
 * locally, would send the viewer *forward* to the generation's start. Core's
 * `generationLocalPosition` returns nothing there, and the coordinator asks
 * the node. Ahead, the bound is what the player has buffered
 * (`seekRequiresReposition`).
 *
 * No session is a downloaded original, and Direct is a byte range over a
 * complete file: both are always local.
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
