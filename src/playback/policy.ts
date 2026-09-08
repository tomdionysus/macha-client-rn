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
