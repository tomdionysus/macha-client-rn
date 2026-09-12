import {
  restatePreferencesClearedByMode,
  type PlaybackMode,
  type PlaybackSession,
  type PlaybackUpdate,
  type StreamInstruction,
} from '@macha/core';

// Playback policy: the decisions this client makes about a session, separated
// from the runtime that acts on them. They live here rather than in the
// provider so they can be exercised without the video player, the audio engine
// and the whole React tree coming with them.

/**
 * A play order over the queue.
 *
 * Shuffle has to be *stable*: re-randomising on every skip means Previous
 * doesn't return where you came from, and a "random" run can repeat a track
 * while others go unheard. So the order is computed once when shuffle is
 * turned on and kept until it is turned off or the queue is replaced. The
 * current item is pinned to the front so enabling shuffle never interrupts
 * what is playing.
 */
export function buildOrder(length: number, shuffle: boolean, currentIndex: number): number[] {
  const sequential = Array.from({ length }, (_, index) => index);
  if (!shuffle || length < 2) return sequential;
  const rest = sequential.filter((index) => index !== currentIndex);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return currentIndex >= 0 && currentIndex < length ? [currentIndex, ...rest] : rest;
}
/**
 * The stream work a named mode implies.
 *
 * Direct and remux copy both streams; transcode re-encodes both. This is the
 * viewer's own choice being spelled out, not a decision — `choosePlaybackInstruction`
 * makes those, and it is deliberately not consulted here, because a viewer who
 * names a mode may know something the facts do not.
 */
export function transformFor(mode: PlaybackMode): { video: StreamInstruction; audio: StreamInstruction } {
  const work: StreamInstruction = mode === 'transcode' ? 'transcode' : 'copy';
  return { video: work, audio: work };
}
/**
 * States the whole transform whenever an update names a mode.
 *
 * A bare `mode` is a legal request and the node restates the transform around
 * it, choosing `video` and `audio` itself. That is the one thing this client
 * must not allow: the node performs what it is told without asking what this
 * device can decode, so a transform it picked could come back as a file the
 * player cannot demux. Every other update — quality, audio track, subtitle
 * track — leaves the transform alone and passes through untouched.
 */
export function statedUpdate(update: PlaybackUpdate, session: PlaybackSession): PlaybackUpdate {
  const mode = update.preferences?.mode;
  // `'choose'` would mean asking the server to pick, which this client never
  // does — the node performs what it is told without asking what this device
  // can decode, so the decision has to be made where the answer is known.
  if (!mode || mode === 'choose') return update;
  // Two halves. This client always states the per-stream work, because the node
  // performs what it is told without asking what the device can decode — so the
  // transform is restated here rather than left for the server to infer.
  //
  // The quality ceiling is core's rule and is now core's code: server 0.34.0
  // clears `max_height` and `max_bitrate` when a PATCH names `mode`, and a cap
  // the viewer set from the Quality control should survive them touching Mode.
  // This used to be a hand-maintained copy of `restatePreferencesClearedByMode`
  // — unavoidable while this client decoded its own session shape, and the
  // exact duplication that let a server change land twice. Decoding into core's
  // session retired it.
  return restatePreferencesClearedByMode(
    { ...update, preferences: { ...transformFor(mode), ...update.preferences } },
    session,
    undefined,
  );
}

/** A seek the player has been asked for but has not yet reached. */
export interface PendingSeek {
  targetMs: number;
  atMs: number;
}

/**
 * How near a report has to land before the seek counts as settled.
 *
 * Generous on purpose: a transformed stream seeks to the nearest keyframe, so
 * the position the player settles on is the node's answer rather than the one
 * asked for, and it can be a second or so away.
 */
const SEEK_SETTLED_TOLERANCE_MS = 1_500;

/**
 * How long to wait before believing the player again regardless.
 *
 * Without this, a seek that never lands — a failed generation, a stream that
 * ends short of the target — would freeze the reported position permanently,
 * which is a worse bug than the one being fixed.
 */
const SEEK_DEADLINE_MS = 6_000;

/**
 * Whether a reported position is still the pre-seek one and should be ignored.
 *
 * Both engines keep reporting the old position for a few frames after a seek.
 * Accepting those drags the bar back to where the viewer just left, then jumps
 * it forward when the seek lands — the scrubber appearing to fight them — and
 * checkpoints the stale position to Continue Watching on the way past.
 */
export function seekStillPending(pending: PendingSeek, reportedMs: number, nowMs: number): boolean {
  if (nowMs - pending.atMs >= SEEK_DEADLINE_MS) return false;
  return Math.abs(reportedMs - pending.targetMs) > SEEK_SETTLED_TOLERANCE_MS;
}

/**
 * The volume to restore after expo-video ducked the player, or `undefined` to
 * leave it alone.
 *
 * expo-video ducks by mutating the viewer-facing volume — `player.volume /= 2f`
 * in `AudioFocusManager.duckPlayer` — and its `volume` setter assigns
 * `userVolume = volume` (`VideoPlayer.kt:132-136`). So the duck **overwrites the
 * reference the unduck restores from**: `unduckPlayer` sets
 * `player.volume = player.userVolume`, which is by then the ducked value. Every
 * duck therefore halves the volume permanently, whether or not the
 * `AUDIOFOCUS_GAIN` that triggers the unduck ever arrives, and they compound.
 *
 * **Measured on an Android 12 device, and the reach is narrower than the source
 * suggests.** Because `willPauseWhenDucked` is never set, the framework ducks
 * automatically on API 26+ and does *not* deliver
 * `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` to the app — so `duckPlayer` never runs
 * and the volume is never mutated. Verified by inducing a real
 * `GAIN_TRANSIENT_MAY_DUCK` from a notification: the audio ducked at the mixer,
 * and this client's focus-stack entry still read `loss: none -- notified: false`.
 *
 * `minSdkVersion` is 24, and expo-video takes a deprecated pre-O path below API
 * 26 where the callback *is* delivered. So this guards Android 7.0/7.1, where the
 * bug is real, and is inert everywhere this app has actually run. It is kept
 * because it is cheap and because it catches any unrequested drop, not only a
 * duck — not because anything here has been seen to lose volume.
 *
 * Restoring is in any case not antisocial: the platform's own duck is at the
 * mixer and survives this.
 *
 * Returning `undefined` when the volume already matches is what makes the
 * caller loop-safe — writing the value emits another `volumeChange`.
 */
export function restoredVolume(reported: number, intended: number): number | undefined {
  return reported < intended ? intended : undefined;
}
