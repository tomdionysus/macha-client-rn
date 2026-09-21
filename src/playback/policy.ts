import {
  restatePreferencesClearedByMode,
  SERVER_SEGMENT_HOLD_MS,
  type PlaybackMode,
  type PlaybackSession,
  type PlaybackUpdate,
  type StreamInstruction,
} from '@machafoundation/core';

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

/**
 * The server code for the per-account playback session cap.
 *
 * **A mirror of a private set in core, and recorded as one.** Server 0.48.0
 * adds this cap as the admission control that replaces one-session-per-bearer:
 * once one bearer can hold several sessions, nothing else bounds an account.
 * Core classifies it in `ACCOUNT_SCOPED_FAILURE_CODES` so the refusal is
 * neither walked nor charged — every node answers it identically, so a walk is
 * guaranteed-futile work that would also record a failure against every
 * healthy node on the way.
 *
 * That set and its predicate are **module-private in core**, so there is
 * nothing to import and this string is the only way to recognise the outcome
 * here. Core has been asked to export the predicate; when it does, delete this
 * and call it. Until then this is a second declaration of one server fact,
 * which is the shape of defect this project keeps writing down.
 */
export const ACCOUNT_SESSION_LIMIT_CODE = 'account_session_limit';

/** What a refused `create` means, and therefore what may be done about it. */
export type CreateRefusal = 'degrade' | 'account-session-limit' | 'fatal';

/**
 * Why a node refused to create a playback session.
 *
 * **Duck-typed, deliberately, and this is the bug it fixes.** Two error classes
 * reach this path carrying the same four fields: core's `MachaPlaybackError`,
 * which its resolver raises, and this client's `MachaApiError` from its own
 * fetch layer. `createSession` tested `error instanceof MachaApiError` before
 * deciding whether to degrade an instruction — and core throws the *other*
 * class, so that branch could never be taken and every refusal was fatal.
 * Core reads `code` and `reason` off the object rather than testing identity
 * for the same reason; this follows it.
 *
 * The three outcomes want three different things:
 *
 * - **`degrade`** — a `400` is the node rejecting *this transform*. Asking for
 *   less is exactly the remedy, and `degradeInstruction` provides it.
 * - **`account-session-limit`** — a `429` naming the account cap is a fact
 *   about the account, not the instruction and not the node. Degrading cannot
 *   help, another node would answer identically, and the viewer needs to be
 *   told something true: they are already playing somewhere else. New with the
 *   REST-resource change; see `TODO/ACTIVE.md`.
 * - **`fatal`** — everything else, including a `429` that is *not* the account
 *   cap. A node-wide limit is a different scope with a different remedy: core
 *   walks and charges there, correctly, because that node really is full, and
 *   reporting it to the viewer as their own account being at its limit would
 *   be a lie with an action attached.
 */
export function classifyCreateRefusal(error: unknown): CreateRefusal {
  if (!error || typeof error !== 'object') return 'fatal';
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (status === 429 && code === ACCOUNT_SESSION_LIMIT_CODE) return 'account-session-limit';
  if (status === 400) return 'degrade';
  return 'fatal';
}

/**
 * What to put in front of a viewer whose account is at its session cap.
 *
 * **Not the server's sentence.** Core wraps it as "Macha playback request
 * failed: ...", which reads as a breakage, and the node is working exactly as
 * designed — the account is simply already playing as much as it may. This is
 * the same argument `isAuthRefusal` makes about 401 and 403: true, accurate
 * and useless to whoever is holding the phone.
 *
 * The server states the limit and the current count in the body, and the
 * envelope's message is the only place this client can see them, so it is kept
 * as a detail rather than discarded. Nothing here parses figures out of it —
 * that would be a second reading of a format the server owns.
 */
export function accountSessionLimitMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message.replace(/^Macha playback request failed:\s*/, '') : '';
  const lead = 'This account is already playing on as many devices as it is allowed. Stop playback elsewhere and try again.';
  return detail ? `${lead} (${detail})` : lead;
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
 * How far above the serving node's hold a seek is still allowed to land.
 *
 * The hold is what the *node* spends: a fragment at the production frontier is
 * held until it exists, and only then answered. Everything after that is this
 * side of the wire — whatever the player does with the answer, and the first
 * byte of the one that follows. A window equal to the hold leaves none of that
 * room, which is precisely how `SEEK_DEADLINE_MS = 6_000` came to expire at the
 * exact moment a correctly-behaving node was answering.
 *
 * Two seconds, matching core's `HLS_WALK_HOLD_MARGIN_MS`, which covers the same
 * distance for the same reason. **It is not sized on media3's retry behaviour**,
 * which is an open contradiction in `TODO/ACTIVE.md` — the bytecode says a
 * segment 500 is retried with backoff, this repo measured one fatal on first
 * occurrence, and nobody has settled it on hardware. If retries are real the
 * margin is too small; it is still strictly more room than none.
 */
const SEEK_HOLD_MARGIN_MS = 2_000;

/**
 * How long to wait before believing the player again regardless.
 *
 * Without this, a seek that never lands — a failed generation, a stream that
 * ends short of the target — would freeze the reported position permanently,
 * which is a worse bug than the one being fixed.
 *
 * **Derived from the node that issued the generation, never chosen here.**
 * Core 0.14.0 carries `segmentHoldMs` on the source for the node actually
 * serving it, and `SERVER_SEGMENT_HOLD_MS` is the published floor for a node
 * too old to say, one with a status call that has not landed, or a session
 * without the `view_status` role those figures ride on. This client's own
 * 6_000 was chosen without reference to the server and happened to equal it —
 * the fifth pair of independently chosen constants in this project that had to
 * relate and did not, and the only one left here.
 *
 * Both directions matter. A node holding for ten seconds was being called a
 * failure at six; a node holding for two was being excused for four seconds it
 * had no claim to.
 */
function seekDeadlineMs(session: PlaybackSession | undefined): number {
  const stated = session?.source.budgets?.segmentHoldMs;
  return (stated === undefined ? SERVER_SEGMENT_HOLD_MS : Math.max(0, stated)) + SEEK_HOLD_MARGIN_MS;
}

/**
 * Whether a reported position is still the pre-seek one and should be ignored.
 *
 * Both engines keep reporting the old position for a few frames after a seek.
 * Accepting those drags the bar back to where the viewer just left, then jumps
 * it forward when the seek lands — the scrubber appearing to fight them — and
 * checkpoints the stale position to Continue Watching on the way past.
 */
export function seekStillPending(
  session: PlaybackSession | undefined,
  pending: PendingSeek,
  reportedMs: number,
  nowMs: number,
): boolean {
  if (nowMs - pending.atMs >= seekDeadlineMs(session)) return false;
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

/**
 * Whether a seek must reposition the *generation* rather than just the player.
 *
 * Measured on an Android device 2026-09-13, and this is the failure it exists to
 * stop. A transformed generation is produced forward from its origin, and the
 * node holds only a bounded window of it. Seeking an hour into a film asks for a
 * segment hundreds past anything being built, and the node refuses it
 * **immediately** — `beyond_hold_window`, sub-millisecond, nothing is working
 * toward it. media3 does not retry that: it is a fatal `Source error` on first
 * occurrence. This client then read a fatal player error as a bad node, stopped
 * a perfectly healthy session and rebuilt on another node, discarding the
 * transcode already produced.
 *
 * None of that is the node's fault and none of it is fixable by waiting longer:
 * the server's hold covers segments it is *working on*, and this one it had
 * never been asked to start. The fix is to move production to where the viewer
 * went, which a seek-only PATCH does cheaply — the plan state is retained, the
 * segment indices are plan-absolute, and the URLs stay valid.
 *
 * **Keyed on what the player has buffered, deliberately, and not on a guess at
 * the node's window.** We cannot see the node's `segment_hold_window` and must
 * not keep a second copy of it — two independently chosen constants colliding is
 * already four bugs in this project. Buffered-end is knowable here and errs the
 * safe way: production may be further ahead than the buffer, so this can ask for
 * a reposition that was not strictly needed. That costs one cheap PATCH. Being
 * wrong the other way costs a healthy node and every frame it had built.
 *
 * **Forward seeks only.** A bounded window implies a far *backward* seek could
 * also fall outside it, but that has not been measured and this does not guess:
 * an unverified claim about the server is exactly what produced the defect above.
 */
export function seekRequiresReposition(
  session: PlaybackSession | undefined,
  targetMs: number,
  bufferedEndMs: number,
): boolean {
  // No session is a downloaded original played off the disk. There is no node,
  // no generation, and nothing to reposition.
  if (!session) return false;
  // Direct play is a byte range over a complete file: every offset already
  // exists and the node will serve any of them.
  if (!session.source.isManifest) return false;
  return targetMs > bufferedEndMs;
}

/**
 * Whether a player error is evidence about the *endpoint*.
 *
 * The distinction this client got wrong. A fatal error while a seek we asked for
 * is still outstanding, on a generation the node is still producing, says we
 * asked for something that does not exist yet — not that the node is failing.
 * Failing over on it abandons a working node, throws away its work, and starts
 * the same transcode again somewhere else.
 *
 * The same argument core already makes for stalls: a source that has never
 * delivered a frame has not proved anything about where it came from. Here it is
 * a seek rather than a cold start, but the reasoning is identical — the evidence
 * is about the request, not the server.
 *
 * Deliberately narrow. Anything *not* in that window still blames the endpoint,
 * because a transformed stream failing during ordinary playback is exactly what
 * failover exists for, and this must not become a blanket excuse that leaves a
 * viewer stuck on a genuinely dead node.
 */
export function errorBlamesEndpoint(
  session: PlaybackSession | undefined,
  pendingSeek: PendingSeek | undefined,
  nowMs: number,
): boolean {
  if (!session || !pendingSeek) return true;
  // Direct play has no production to outrun; an error there is the node's.
  if (!session.source.isManifest) return true;
  // Past the deadline the seek is no longer a credible explanation, and the
  // same guard that stops a lost seek freezing the position stops it excusing
  // an endpoint forever.
  return nowMs - pendingSeek.atMs >= seekDeadlineMs(session);
}
