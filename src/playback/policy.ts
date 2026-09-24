import { deviceCapabilities } from './capabilities';
import {
  isAccountSessionLimit,
  isSubtitleOnlyPlaybackUpdate,
  playbackFailureCode,
  playbackFailureDetail,
  playbackFailureStatus,
  restatePreferencesClearedByMode,
  SERVER_SEGMENT_HOLD_MS,
  SESSION_PROVENANCE_UNKNOWN_CODE,
  containerIsPlayable,
  technicalProfileFromSession,
  videoStreamObjection,
  type PlaybackCapabilities,
  type PlaybackDecisionReason,
  type PlaybackMode,
  type PlaybackPolicyOverrides,
  type PlaybackSession,
  type PlaybackUpdate,
  type StreamInstruction,
  unreachableEndpointFailure,
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
 * Whether a copy of this audio would give the device something it can play.
 *
 * `undefined` — nothing known about the source audio — answers `true`, which
 * is the behaviour that was here before and leaves the node's own judgement
 * in charge.
 */
export function audioCopyable(codec: string | undefined, decodable: readonly string[]): boolean {
  if (!codec) return true;
  return decodable.includes(codec.toLowerCase());
}

/** The codec of the audio stream a session is presenting, where it says. */
export function sessionAudioCodec(session: PlaybackSession | undefined): string | undefined {
  const streams = session?.options?.audioStreams ?? [];
  if (streams.length === 0) return undefined;
  const chosen = session?.preferences?.audioStream ?? null;
  const stream =
    chosen === null
      ? (streams.find((candidate) => candidate.default) ?? streams[0])
      : streams.find((candidate) => candidate.index === chosen);
  return stream?.codec;
}

/**
 * The stream work a named mode implies.
 *
 * Direct and remux copy both streams; transcode re-encodes both. This is the
 * viewer's own choice being spelled out, not a decision — `choosePlaybackInstruction`
 * makes those, and it is deliberately not consulted here, because a viewer who
 * names a mode may know something the facts do not.
 *
 * **Except about its own decoders, which is what `audioCopyable` is for.** A
 * viewer naming "Remux" is asking for the container to be rewrapped, not for
 * an audio codec this device cannot decode — and before 2026-09-21 this
 * returned `audio: 'copy'` unconditionally, so on an AC-3 title the phone
 * asked the node to copy audio it has no decoder for. **That is the same
 * defect as the `ac3`/`eac3` capability claim, one layer up**: the node picks
 * `video: copy, audio: transcode` for those titles on create, correctly, and
 * the mode switch threw that judgement away and demanded the copy.
 *
 * **Two things went wrong with it and only one is ours.** Served perfectly,
 * the copy would have been a silent film here. Served by this cluster it hung:
 * copying (E-)AC-3 into fragmented MP4 never produces a first fragment, which
 * three clients confirmed on 2026-09-21 and the server traced to `delay_moov`
 * waiting for a parsed packet that a copy path never produces. **The server
 * fault is not ours to fix and this is not a workaround for it** — asking to
 * copy audio the device cannot decode was wrong before the stall existed and
 * would still be wrong if it were fixed tomorrow.
 *
 * Video is untouched: this says nothing about video decoders, only that the
 * one claim the audio path was making without checking is now checked.
 *
 * **A remux that cannot copy the audio becomes a transcode, and the mode has
 * to change with it.** The server refuses the halfway shape outright —
 * `playback.cpp:524`, *"remux repackages and copies every stream: to re-encode
 * one, ask for mode=transcode with video=copy or audio=copy for the stream
 * that is being copied"* — and refuses the mirror of it at `:529`, a transcode
 * that re-encodes nothing. **So this returns the mode as well**, because
 * correcting the transform without correcting the name buys a `400` instead of
 * a stall. The web client shipped that exact halfway fix an hour before this
 * and had it refused.
 *
 * **Direct play has no transform to adjust**, so nothing here changes for it.
 * It used to be left alone on the argument that a viewer who names it gets
 * what they asked for; Tom reversed that on 2026-09-24, and Direct is now
 * offered only when this device can decode the video and open the file —
 * `directUnavailableReason` greys it out otherwise. Audio this device cannot
 * decode still gets through Direct as silence; that case was not part of the
 * decision.
 */
export function transformFor(
  mode: PlaybackMode,
  canCopyAudio = true,
): { mode: PlaybackMode; video: StreamInstruction; audio: StreamInstruction } {
  if (mode === 'transcode') return { mode, video: 'transcode', audio: 'transcode' };
  if (mode === 'remux' && !canCopyAudio) return { mode: 'transcode', video: 'copy', audio: 'transcode' };
  return { mode, video: 'copy', audio: 'copy' };
}
/**
 * Why Remux cannot play here, in a sentence for the viewer — or undefined when
 * it can.
 *
 * **The video half `transformFor` leaves alone.** Remux copies the video, so
 * it is only real when this device can decode that video. Seen failing on the
 * A85 2026-09-23 on the tagged 0.8.0: *Dark* S01E01 is ten-bit HEVC, the probe
 * reported no Main 10, Remux asked the node to copy it, the decoder refused
 * it and the viewer got a black screen. Tom's call the same day: keep Remux in
 * the menu and say why it is unavailable, rather than hide it or quietly turn
 * it into the transcode the viewer just left.
 *
 * **The judgement is core's, not a second one here.** `videoStreamObjection`
 * is what chose transcode for the title on create; this asks it of the video
 * stream the session is presenting, as the server describes it, against the
 * HLS decoder list because that is how a remux arrives — core's own
 * `deliveryVideoCodecs` rule. Its silence is inherited too: an unreported bit
 * depth is not an objection, so a source the server could not probe is still
 * offered.
 */
export function remuxUnavailableReason(
  session: PlaybackSession,
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides = {},
): string | undefined {
  const delivered = { ...capabilities, videoCodecs: capabilities.hlsVideoCodecs ?? capabilities.videoCodecs };
  return videoUnavailableReason(session, delivered, capabilities, overrides);
}

/**
 * Why Direct play cannot play here, in a sentence for the viewer — or
 * undefined when it can.
 *
 * **Tom's call, 2026-09-24, reversing the one `transformFor` recorded.** Direct
 * had been left alone on the argument that a viewer who names it gets what they
 * asked for; on the A85 what they got for *Dark* was a decoder refusal, from a
 * mode the menu offered without comment. It is now kept and explained exactly
 * as Remux is.
 *
 * Direct delivers the original file, so two things can rule it out that differ
 * from Remux: the video is judged against the **direct-play** decoders, not the
 * HLS list, and the **container** has to be one this device opens — core's
 * `containerIsPlayable`, the same test its chooser uses. The remedy named
 * differs with the cause: video this device cannot decode rules out Remux too,
 * so only Transcode helps; a container alone is exactly what Remux replaces.
 */
export function directUnavailableReason(
  session: PlaybackSession,
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides = {},
): string | undefined {
  const video = videoUnavailableReason(session, capabilities, capabilities, overrides);
  if (video) return video;
  const format = session.sourceInfo.container ?? session.sourceInfo.format;
  if (format && !containerIsPlayable(format, capabilities.containers ?? [])) {
    return 'Unavailable: this device cannot open this file as it is. Remux will play it.';
  }
  return undefined;
}

/** The shared half: the presented video stream against a decoder list. */
function videoUnavailableReason(
  session: PlaybackSession,
  judgedAgainst: PlaybackCapabilities,
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides,
): string | undefined {
  const streams = technicalProfileFromSession(session).streams.filter((stream) => stream.type === 'video');
  const stream = streams.find((candidate) => candidate.index === session.selected.videoStream) ?? streams[0];
  if (!stream) return undefined;
  const objection = videoStreamObjection(stream, judgedAgainst, overrides);
  if (!objection) return undefined;
  return `Unavailable: ${objectionSentence(objection, stream.bitDepth, capabilities.videoBitDepth)} Transcode will play it.`;
}

/** The viewer's version of a video objection: what is true, not the code for it. */
function objectionSentence(
  objection: PlaybackDecisionReason,
  sourceBitDepth: number | undefined,
  deviceBitDepth: number | undefined,
): string {
  switch (objection) {
    case 'video-bit-depth-exceeds-client':
      return `this video is ${sourceBitDepth}-bit and this device can only decode ${deviceBitDepth}-bit.`;
    case 'video-transfer-not-presentable':
      return 'this video is HDR and this device cannot display it.';
    case 'video-dolby-vision-not-supported':
      return 'this video needs Dolby Vision, which this device does not support.';
    case 'video-codec-not-playable':
    case 'video-codec-not-deliverable-over-hls':
      return 'this device cannot decode this video’s format.';
    default:
      return 'this device cannot play this video without converting it.';
  }
}

/**
 * Says where a new generation should start: where the viewer is.
 *
 * **This client stands in for `PlaybackCoordinator` here too, and had not
 * carried this rule.** The coordinator sends every representation update with
 * `seekMs` at the current position, except a subtitle-only one or a session
 * that cannot seek — core's `isSubtitleOnlyPlaybackUpdate` draws that line and
 * is used as-is. Without it the node starts the new generation where it
 * likes: on the A85 2026-09-23 23:42, *2001* at 1:08:10 switched Direct to
 * Remux and began again at `seekMs: 0`, and the 18:31 Remux on *Dark* came
 * back at `0` the same way. `applyUpdate` had covered only a Direct target,
 * by setting the player's position after the fact.
 *
 * A position the caller already stated wins; the position is bound when the
 * request is made, which is also the coordinator's rule.
 */
export function positionedUpdate(update: PlaybackUpdate, session: PlaybackSession, positionMs: number): PlaybackUpdate {
  if (update.seekMs !== undefined) return update;
  if (isSubtitleOnlyPlaybackUpdate(update) || !session.options?.canSeek) return update;
  return { ...update, seekMs: Math.max(0, Math.round(positionMs)) };
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
  // The stated instruction wins over the mode the viewer pressed, and the
  // order matters: spreading `update.preferences` last would put `remux` back
  // over a corrected `transcode` and buy the 400 described in `transformFor`.
  const stated = transformFor(mode, audioCopyable(sessionAudioCodec(session), decodableAudio()));
  return restatePreferencesClearedByMode(
    { ...update, preferences: { ...update.preferences, ...stated } },
    session,
    undefined,
  );
}

/** What a refused `create` means, and therefore what may be done about it. */
export type CreateRefusal = 'degrade' | 'account-session-limit' | 'fatal';

/**
 * Why a node refused to create a playback session.
 *
 * **Never an `instanceof` test, and this is the bug it fixes.** Two error
 * classes reach this path carrying the same fields — core's
 * `MachaPlaybackError`, which its resolver raises, and this client's
 * `MachaApiError` — and core wraps either in a third, `MachaEndpointError`,
 * on the way out. `createSession` tested `error instanceof MachaApiError`
 * before deciding whether to degrade an instruction, so that branch could
 * never be taken and **every refusal was fatal**. Identity is the one thing
 * that does not survive the boundary between core and a client; core's own
 * rule since 0.17.0 is to duck-type on `status`/`code` for exactly this.
 *
 * The three outcomes want three different things:
 *
 * - **`degrade`** — a `400` is the node rejecting *this transform*. Asking for
 *   less is the remedy, and `degradeInstruction` provides it.
 * - **`account-session-limit`** — the account is already holding as many
 *   sessions as it may. Not the instruction and not the node: degrading cannot
 *   help and every node answers identically. Recognised with core's
 *   `isAccountSessionLimit`, which keys on the code alone and walks the cause
 *   chain, so the set of account-scoped codes stays core's to track and this
 *   client does not spell one.
 * - **`fatal`** — everything else, including a `429` that is *not* the account
 *   cap. A node-wide limit is a different scope with a different remedy: core
 *   walks and charges there, correctly, because that node really is full, and
 *   telling the viewer their own account is at its limit would be a lie with
 *   an action attached.
 *
 * **Both readings go through core's accessors, never off the object in hand.**
 * `endpointFailure()` wraps a refusal in a `MachaEndpointError` carrying
 * neither `status` nor `code`, so the fields are one link down in `cause`.
 * `playbackFailureCode` and `playbackFailureStatus` walk that chain,
 * outermost first and cycle-safe; this client wrote its own walk for an hour
 * and core exported theirs, which also rejects a non-finite status.
 */
export function classifyCreateRefusal(error: unknown): CreateRefusal {
  if (!error || typeof error !== 'object') return 'fatal';
  if (isAccountSessionLimit(error)) return 'account-session-limit';
  return playbackFailureStatus(error) === 400 ? 'degrade' : 'fatal';
}

/**
 * Whether a failed recovery attempt should count against the failover budget.
 *
 * **The client-side mirror of the defect core found in itself**, and worth
 * naming as such. Core charged every healthy node it walked for an
 * account-scoped refusal, because the charge was gated on a status that says
 * "try the next node". This client has its own version of that fund: the
 * failover budget exists to stop a broken title cycling nodes for ever, and
 * the attempt is counted *before* the call is made.
 *
 * An account cap is not a node failing. Spending recovery budget on it means
 * three cap refusals exhaust a title's failover allowance without a single
 * node having done anything wrong — so the next genuine failure, the one the
 * budget exists for, has nothing left to spend. Every node would answer the
 * cap identically, so there was never a recovery to attempt.
 */
export function spendsFailoverBudget(error: unknown): boolean {
  return classifyCreateRefusal(error) !== 'account-session-limit';
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
 * The server states the limit and the current count in the body, and its
 * sentence is the only place this client can see them, so it is kept as a
 * detail rather than discarded. Nothing here parses figures out of it —
 * that would be a second reading of a format the server owns.
 */
export function accountSessionLimitMessage(error: unknown): string {
  const detail = playbackFailureDetail(error);
  const lead = 'This account is already playing on as many devices as it is allowed. Stop playback elsewhere and try again.';
  return detail ? `${lead} (${detail})` : lead;
}

/**
 * What to put in front of a viewer whose title would not start.
 *
 * **This was `describeError` until 2026-09-23, which is `.message`**, so every
 * create refusal but the account cap reached the screen as core's log line —
 * *"Macha endpoint https://macnessa.macha.network failed: Macha playback
 * request failed: ..."*, both envelopes and the node's address.
 *
 * Tom's rule, the same day: it depends on the error, it must be something a
 * person can understand, and it must be honest. So one lead per kind of
 * failure, saying only what is known, read through core's accessors because
 * the status and code sit one `cause` down; and the server's own sentence in
 * brackets where it stated one, because it is the only place the actual
 * reason appears. Not for 401 and 403, whose sentences describe tokens and
 * roles to someone who can only act on "log in".
 *
 * "Could not reach" is claimed only when no layer stated a status **or** a
 * code: core's `unreachableEndpointFailure` is true of any wrapped error
 * without a status, and a refusal this client raised itself carries a code
 * and no status — calling that a connection problem would be the dishonest
 * version.
 */
export function createFailureMessage(error: unknown): string {
  if (isAccountSessionLimit(error)) return accountSessionLimitMessage(error);
  const status = playbackFailureStatus(error);
  const detail = playbackFailureDetail(error);
  const quoted = (lead: string) => (detail ? `${lead} (${detail})` : lead);
  if (status === 401) return 'You are not logged in. Log in and try again.';
  if (status === 403) return 'This account is not allowed to play this. Log in with an account that is.';
  if (status === 404) return quoted('This title is no longer on the server.');
  if (status === 429) return quoted('The server is busy with other streams right now. Try again in a few minutes.');
  if (status === 400) return quoted('The server could not prepare this title for this device.');
  if (status !== undefined && status >= 500) return quoted('The server could not start this stream. Try again in a moment.');
  if (status === undefined && playbackFailureCode(error) === undefined && unreachableEndpointFailure(error)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return quoted('This title could not be started. Try again.');
}

/**
 * What to put in front of a viewer whose jump to another point was refused.
 *
 * The last playback site that used `describeError` — core's log line, node
 * address included. A refused rebuilding seek leaves the node's generation as
 * it was, and `seekTo` returns before touching the player's position, so the
 * viewer is still where they were. They may be paused, so this does not claim
 * playback carried on. The node's sentence is quoted as the other refusals do.
 */
export function seekRefusalMessage(error: unknown): string {
  if (isAccountSessionLimit(error)) return accountSessionLimitMessage(error);
  const lead = 'Could not jump to that point just now, so playback stayed where it was.';
  const detail = playbackFailureDetail(error);
  return detail ? `${lead} (${detail})` : lead;
}

/**
 * What to put in front of a viewer whose generation change was refused.
 *
 * **Playback did not break, and the message must not say it did.** A mode or
 * quality change is a `PATCH` against a session that is already playing; if
 * the node refuses it, the existing source carries on untouched. Core's
 * envelope reads "Macha playback request failed: video transcode limit
 * reached", which describes a broken player to someone whose film is still on
 * screen — the same argument `accountSessionLimitMessage` makes about the cap.
 *
 * **Measured 2026-09-21 on the A85, and both refusals are real.** Switching
 * *2010* to transcode answered `429 resource_limit` / "video transcode limit
 * reached" after 425 ms; switching it, and *Avatar: Fire and Ash*, to remux
 * answered `503 playback_pipeline_start_failed` / "timed out waiting for first
 * fragmented-MP4 segment" after 15.1 s and 16.0 s. In all three the picture
 * kept playing and the viewer was told the request had failed.
 *
 * The node's own sentence is kept as a detail rather than discarded: it is the
 * only place the reason appears, and nothing here parses figures out of it.
 * It is read through core's `playbackFailureDetail`, which carries it beside
 * the message instead of inside it. This used to strip core's `Macha ...
 * failed:` prefixes off `.message` until none matched, which would have gone
 * silent the first time core reworded one. No detail means no layer stated a
 * sentence, and the lead stands alone rather than quoting a log line.
 */
export function updateRefusalMessage(error: unknown): string {
  if (isAccountSessionLimit(error)) return accountSessionLimitMessage(error);
  const lead = 'The node could not change the stream just now. Playback has carried on unchanged.';
  const detail = playbackFailureDetail(error);
  return detail ? `${lead} (${detail})` : lead;
}

/** The audio codecs this device can actually decode. */
function decodableAudio(): readonly string[] {
  return deviceCapabilities().audioCodecs ?? [];
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
 * Where a generation's media begins on the title's timeline.
 *
 * **This client stands in for `PlaybackCoordinator`, and that is the whole
 * reason these three functions exist.** Core's `docs/choosing-playback.md`
 * says of `seekMs` / `seekOffsetMs` / `seekRequestedMs`: *"the core consumes
 * these; a host must not"* — because the coordinator converts between the
 * title's timeline and the generation's and hands the player a
 * generation-local position, so a host that corrects as well double-corrects
 * and ends up, in the doc's phrase, "self-consistent and wrong".
 *
 * **That rule assumes the conversion is happening, and here it is not.** This
 * client drives `ClusterPlaybackResolver` directly and constructs no
 * coordinator, so nobody converts. Confirmed with core on 2026-09-21, which
 * named this client as the case the doc does not cover. **Do not delete this
 * as a double-correction without first checking whether a coordinator has
 * appeared** — that is the mistake this comment exists to prevent.
 *
 * **Measured, 2026-09-21, A85 against a 0.48.0 node.** *Avatar*, transcode,
 * 2:58:09 long. Scrubbed to 1:44:35; the node accepted `seek_ms 6275725`, built
 * generation 2 and echoed `seekMs: 6275725`; the player then reported ~13 s and
 * the bar read `0:13` with the handle at the far left. Reproduced on *Arrival*.
 *
 * **It is `seekMs`, not `seekOffsetMs`.** The offset is how far *into* the
 * generation the request sits, and it is **0 on transcode and direct** — which
 * is exactly the case measured above, so reading the offset would have
 * corrected nothing and would have been wrong on remux, where the remainder is
 * already inside `seekRequestedMs`. What is missing is the generation's
 * *origin*, and that is `seekMs`.
 *
 * Direct play is the whole file, so its origin is zero and the two timelines
 * coincide — which is why this defect never showed there, and why `isManifest`
 * is the discriminator rather than the mode.
 */
export function generationOriginMs(session: PlaybackSession | undefined): number {
  // No session is a downloaded original played off the disk: one timeline only.
  if (!session || !session.source.isManifest) return 0;
  return Math.max(0, session.seekMs ?? 0);
}

/**
 * A position the player reported, on the title's timeline.
 *
 * Everything above the player in this client — the bar, Continue Watching,
 * the seek-settled check, the play-count threshold — means title-absolute.
 * Convert here, once, at the point the player's figure arrives.
 */
export function titlePositionMs(session: PlaybackSession | undefined, reportedMs: number): number {
  return generationOriginMs(session) + Math.max(0, reportedMs);
}

/**
 * A title position as the player's own timeline expresses it.
 *
 * The inverse, for the one place that writes a position *into* the player. A
 * title-absolute value written to `currentTime` on a transformed generation
 * asks for a point that far into a generation that started an hour in, which
 * is off the end of everything the node has produced.
 */
export function generationLocalMs(session: PlaybackSession | undefined, titleMs: number): number {
  return Math.max(0, titleMs - generationOriginMs(session));
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
 * A generation change this client asked for, and how far along it is.
 *
 * `settledAtMs` is undefined while the `PATCH` is in flight and set the moment
 * it answers, success or failure.
 */
export interface PendingSupersede {
  startedAtMs: number;
  settledAtMs?: number;
}

/**
 * Whether this client has just superseded its own generation.
 *
 * **The mode-switch twin of the seek guard below, and it exists because server
 * `0.48.0` made supersession routine.** Every regenerate, mode switch and
 * rebuilding seek now creates a superseded generation, and a fragment from one
 * answers `410 generation_superseded` — `scope: request`, `node_healthy: true`,
 * `alternative_may_succeed: true`. Read from the server source: the axes say
 * do not walk, the node is fine, and the remedy is a different request to the
 * same node.
 *
 * **A rebuilding seek was already covered** by `errorBlamesEndpoint`'s pending
 * seek. A mode switch was not: `applyUpdate` left no marker, so the guard took
 * its `!pendingSeek` branch, blamed the endpoint, and failed over.
 *
 * **What that costs is not a wasted recovery, it is the picture.** Failover on
 * mobile does not work (Tom, 2026-09-21), so a `410` this client caused takes
 * a viewer who was watching something to a stopped player and an error — where
 * doing nothing leaves the picture up while the new source is applied
 * underneath it. It also spends failover budget and charges a healthy node for
 * a refusal every node would have given.
 *
 * **In flight suppresses unconditionally**; afterwards the node's own
 * `seekDeadlineMs` bounds the tail, because the player can still have a
 * fragment of the old generation in the air for a moment after the swap. That
 * reuses the budget the node states rather than inventing a second constant —
 * two independently chosen constants colliding is already four bugs here.
 *
 * Deliberately narrow, for the same reason the seek guard is: outside this
 * window an error must still blame the endpoint, or a genuinely dead node
 * leaves the viewer stuck for ever. **It only covers supersession this client
 * caused** — a `410` from anything else is not in scope and cannot be, because
 * expo-video never surfaces the status.
 */
export function selfSupersededGeneration(
  pending: PendingSupersede | undefined,
  session: PlaybackSession | undefined,
  nowMs: number,
): boolean {
  if (!pending) return false;
  if (pending.settledAtMs === undefined) return true;
  return nowMs - pending.settledAtMs < seekDeadlineMs(session);
}

/**
 * How long a player error is given to clear before anything acts on it.
 *
 * **Tom's call, 2026-09-24 (option A): an error is trusted only if it
 * persists.** expo-video does not say which source an error came from, and a
 * dying source keeps reporting after it has been replaced — so an error acted
 * on at once could probe the *new* session, or throw away a replacement built a
 * second earlier. Waited out, an error from a replaced source leaves the new one
 * playing and is dropped; a failure of the current source is still there. The
 * window is the node's own, the one the seek and supersede guards use, not a
 * second constant. The cost is up to that long before a genuine recovery starts.
 */
export function errorSettleMs(session: PlaybackSession | undefined): number {
  return seekDeadlineMs(session);
}

/** What `sessionAlive` said about the session a failing player was reading. */
export type ProbeOutcome = 'alive' | 'gone' | 'unknown-provenance' | 'unreachable';

/**
 * Read the owning node's answer to "do you still hold this session?".
 *
 * `false` is the node answering correctly that it reaped the session — the
 * case this whole probe exists for. A throw is two different things, told apart
 * by core's code rather than its wording (`SESSION_PROVENANCE_UNKNOWN_CODE`,
 * added by core on this client's ask): an id core cannot place at all, or a
 * probe that could not be answered. Since `0.18.0` core recovers the node from
 * the id, so a session that was merely released answers `false` rather than
 * throwing — which is why the error has to be attributed to the current
 * generation *before* the probe, not after.
 */
export function classifyProbe(result: { alive: boolean } | { error: unknown }): ProbeOutcome {
  if ('alive' in result) return result.alive ? 'alive' : 'gone';
  return playbackFailureCode(result.error) === SESSION_PROVENANCE_UNKNOWN_CODE ? 'unknown-provenance' : 'unreachable';
}

/**
 * Regenerate on the same node, or fail over.
 *
 * **`gone` regenerates**, on the node that held the session and without
 * charging it: every other node would answer `404` for a session it never had,
 * and core releases before recreating because that node's one transcode slot is
 * held by the session being replaced. **Bounded exactly as core bounds it** —
 * `session-regeneration-made-no-progress`: a regeneration asked for at the
 * same position, rounded to the millisecond, as the previous one changed
 * nothing, so the next step fails over instead of looping on a node that keeps
 * answering the same way.
 *
 * **`alive` fails over, and that is a choice, not a side effect.** Core stops
 * there: a live session answering `404` is a fragment past the end of a live
 * plan, and replacing the node fixes nothing. This client cannot tell that case
 * apart — expo-video hides the status — so a live session under a failing
 * player keeps the old behaviour. **Anything unanswerable fails over too**:
 * ordinary evidence, handled as before.
 *
 * **`unknown-provenance` fails over, where core's written sequence stops, and
 * that is deliberate.** Core raises it only when the id
 * names no node, which never happens here because every id is core's own, or
 * when the resolver has no record of the session and its node has left the
 * registry. Here that takes a services rebuild mid-playback (an access
 * change or a node reconfiguration builds a new resolver) *and* the serving
 * node dropping out of cluster membership. The node that held the session is
 * then gone, and stopping would end playback for nothing.
 */
export function recoveryAfterProbe(
  outcome: ProbeOutcome,
  positionMs: number,
  lastRegenerationPositionMs: number | undefined,
): 'regenerate' | 'failover' {
  if (outcome !== 'gone') return 'failover';
  if (lastRegenerationPositionMs !== undefined && Math.round(lastRegenerationPositionMs) === Math.round(positionMs)) {
    return 'failover';
  }
  return 'regenerate';
}

/** What to do about a player error the supersede guard declined to fail over on. */
export type SupersededErrorCheck = { kind: 'wait'; recheckAtMs: number } | { kind: 'report' };

/**
 * When a declined error stops being excusable and has to reach the viewer.
 *
 * **The guard suppresses the wrong remedy and must not also suppress the
 * report.** `selfSupersededGeneration` is right that a node is not to blame
 * for a generation this client replaced, but it cannot tell a stale fragment
 * of the old generation, which the swap cures, from the new generation
 * failing, which nothing here cures. Declining counted as handled, so the
 * second case left a black picture and no message: seen on the A85
 * 2026-09-21 on a forced Direct play, and 2026-09-23 on the tagged 0.8.0 from
 * a Remux tap, where the new generation's decoder refused ten-bit HEVC 1.8 s
 * after the PATCH answered.
 *
 * So wait out exactly the window the guard uses and then report, if the player
 * is still in error — that last check is the caller's, being a fact about the
 * player rather than the policy. While the PATCH is in flight its settle time
 * is unknown, so look again a whole deadline later and re-evaluate. Reusing
 * `seekDeadlineMs` rather than choosing a second constant is the point: two
 * windows chosen independently is the collision this project keeps paying for.
 */
export function supersededErrorCheck(
  pending: PendingSupersede | undefined,
  session: PlaybackSession | undefined,
  nowMs: number,
): SupersededErrorCheck {
  if (!selfSupersededGeneration(pending, session, nowMs)) return { kind: 'report' };
  const settledAtMs = pending?.settledAtMs;
  return { kind: 'wait', recheckAtMs: (settledAtMs ?? nowMs) + seekDeadlineMs(session) };
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
  pendingSupersede?: PendingSupersede,
): boolean {
  // A generation this client replaced moments ago is not a node failing; see
  // `selfSupersededGeneration`. Checked before the session guard because a
  // mode switch is in flight whatever the current source looks like.
  if (selfSupersededGeneration(pendingSupersede, session, nowMs)) return false;
  if (!session || !pendingSeek) return true;
  // Direct play has no production to outrun; an error there is the node's.
  if (!session.source.isManifest) return true;
  // Past the deadline the seek is no longer a credible explanation, and the
  // same guard that stops a lost seek freezing the position stops it excusing
  // an endpoint forever.
  return nowMs - pendingSeek.atMs >= seekDeadlineMs(session);
}
