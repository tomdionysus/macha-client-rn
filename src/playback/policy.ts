import { NO_NODE_ANSWERED_TEXT, noNodeAnswered, UNREACHABLE_TEXT } from '../api/errors';
import { deviceCapabilities } from './capabilities';
import {
  chooseAmongFiles,
  isAccountSessionLimit,
  isSubtitleOnlyPlaybackUpdate,
  playbackFailureCode,
  playbackFailureDetail,
  playbackFailureStatus,
  restatePreferencesClearedByMode,
  SERVER_SEGMENT_HOLD_MS,
  SESSION_PROVENANCE_UNKNOWN_CODE,
  START_NO_PROGRESS_CODE,
  containerIsPlayable,
  technicalProfileFromSession,
  videoStreamObjection,
  type PlaybackCapabilities,
  type PlaybackDecisionReason,
  type PlaybackInstruction,
  type PlaybackMediaFacts,
  type PlaybackMode,
  type PlaybackPolicyOverrides,
  type PlaybackSession,
  type PlaybackUpdate,
  type StreamInstruction,
  unreachableEndpointFailure,
} from '@machafoundation/core';

// Playback decisions, kept apart from the provider so they test without the player or React.

/**
 * A play order over the queue. Shuffle is computed once and kept until turned
 * off or the queue is replaced, so Previous works and no track repeats early;
 * the current item is pinned first so enabling shuffle never interrupts it.
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
/** Whether this device can decode a copy of this audio; an unknown codec answers true, leaving it to the node. */
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
 * The stream transform a viewer-named mode implies. `choosePlaybackInstruction`
 * is not consulted: a viewer who names a mode may know something the facts do not.
 *
 * Remux whose audio this device cannot decode becomes a transcode (video copy,
 * audio transcode): copied audio would play silent, the server cannot fragment
 * copied (E-)AC-3, and it answers 400 to a remux that re-encodes or a transcode
 * that re-encodes nothing. Direct is only offered when the video decodes and the
 * file opens (`directUnavailableReason`); undecodable audio plays silent.
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
 * Why Remux cannot play here, as a sentence for the viewer, or undefined when it can.
 *
 * Remux copies the video, so it needs a decoder for it. Judged by core's
 * `videoStreamObjection` against the HLS decoder list, since that is how a remux
 * arrives. An unreported bit depth is not an objection.
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
 * Why Direct play cannot play here, as a sentence for the viewer, or undefined when it can.
 *
 * The video is judged against the direct-play decoders and the container must
 * pass core's `containerIsPlayable`. Undecodable video needs Transcode; a
 * container problem alone is what Remux fixes.
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

/** The presented video stream judged against a decoder list. */
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

/** A video objection in the viewer's words. */
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
    case 'video-size-exceeds-client':
      return 'this video is larger than this device plays.';
    case 'video-codec-not-playable':
    case 'video-codec-not-deliverable-over-hls':
      return 'this device cannot decode this video’s format.';
    default:
      return 'this device cannot play this video without converting it.';
  }
}

/**
 * Starts a new generation at the viewer's position, as core's
 * `PlaybackCoordinator` would; otherwise the node starts at `seekMs: 0`.
 * Skipped for subtitle-only updates and unseekable sessions; a caller-stated
 * `seekMs` wins.
 */
export function positionedUpdate(update: PlaybackUpdate, session: PlaybackSession, positionMs: number): PlaybackUpdate {
  if (update.seekMs !== undefined) return update;
  if (isSubtitleOnlyPlaybackUpdate(update) || !session.options?.canSeek) return update;
  return { ...update, seekMs: Math.max(0, Math.round(positionMs)) };
}

/**
 * States the whole transform whenever an update names a mode. Given a bare
 * `mode` the node picks `video` and `audio` without regard to this device's
 * decoders. Updates that name no mode pass through untouched.
 */
export function statedUpdate(update: PlaybackUpdate, session: PlaybackSession): PlaybackUpdate {
  const mode = update.preferences?.mode;
  // `'choose'` would ask the server to pick, which this client never does.
  if (!mode || mode === 'choose') return update;
  // A PATCH naming `mode` clears `max_height`/`max_bitrate` server-side, so restate
  // the quality cap. `stated` is spread last so a corrected `transcode` is not
  // overwritten by the requested `remux` (a 400; see `transformFor`).
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
 * Duck-typed through core's accessors, never `instanceof`: class identity does
 * not survive the core/client boundary, and `MachaEndpointError` carries
 * `status`/`code` one level down in `cause`.
 *
 * - `degrade`: a 400 rejecting this transform; ask for less (`degradeInstruction`).
 * - `account-session-limit`: the account's session cap; every node answers the same.
 * - `fatal`: everything else, including a node-wide 429.
 */
export function classifyCreateRefusal(error: unknown): CreateRefusal {
  if (!error || typeof error !== 'object') return 'fatal';
  if (isAccountSessionLimit(error)) return 'account-session-limit';
  return playbackFailureStatus(error) === 400 ? 'degrade' : 'fatal';
}

/**
 * Whether a failed recovery attempt counts against the failover budget. An
 * account cap is not a node failing, so it must not exhaust the budget.
 */
export function spendsFailoverBudget(error: unknown): boolean {
  return classifyCreateRefusal(error) !== 'account-session-limit';
}

/**
 * Viewer message for an account at its session cap. The server's sentence is
 * appended as a detail but never parsed.
 */
export function accountSessionLimitMessage(error: unknown): string {
  const detail = playbackFailureDetail(error);
  const lead = 'This account is already playing on as many devices as it is allowed. Stop playback elsewhere and try again.';
  return detail ? `${lead} (${detail})` : lead;
}

/**
 * Viewer message for a title that would not start: one plain lead per failure
 * kind, with the server's sentence in brackets where it gave one. Never
 * `.message`, which is a log line with the node's address.
 *
 * "Could not reach" only when no layer stated a status or code, since
 * `unreachableEndpointFailure` is also true of client-raised coded errors.
 */
export function createFailureMessage(error: unknown): string {
  if (isAccountSessionLimit(error)) return accountSessionLimitMessage(error);
  // A start that stopped reporting progress: a 504 with no server sentence.
  if (playbackFailureCode(error) === START_NO_PROGRESS_CODE) return 'The node stopped making progress starting this stream.';
  const status = playbackFailureStatus(error);
  const detail = playbackFailureDetail(error);
  const quoted = (lead: string) => (detail ? `${lead} (${detail})` : lead);
  if (status === 401) return 'You are not logged in. Log in and try again.';
  if (status === 403) return 'This account is not allowed to play this. Log in with an account that is.';
  if (status === 404) return quoted('This title is no longer on the server.');
  if (status === 429) return quoted('The server is busy with other streams right now. Try again in a few minutes.');
  if (status === 400) return quoted('The server could not prepare this title for this device.');
  if (status !== undefined && status >= 500) return quoted('The server could not start this stream. Try again in a moment.');
  if (noNodeAnswered(error)) return NO_NODE_ANSWERED_TEXT;
  if (status === undefined && playbackFailureCode(error) === undefined && unreachableEndpointFailure(error)) {
    return UNREACHABLE_TEXT;
  }
  return quoted('This title could not be started. Try again.');
}

/**
 * Viewer message for a refused rebuilding seek. The player has not moved and
 * may be paused, so it does not claim playback carried on.
 */
export function seekRefusalMessage(error: unknown): string {
  if (isAccountSessionLimit(error)) return accountSessionLimitMessage(error);
  const lead = 'Could not jump to that point just now, so playback stayed where it was.';
  const detail = playbackFailureDetail(error);
  return detail ? `${lead} (${detail})` : lead;
}

/**
 * Viewer message for a refused mode or quality PATCH (e.g. a 429 transcode
 * limit, a 503 pipeline failure). The existing source carries on, so the
 * message must not say playback broke.
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

/** How near a report must land for a seek to count as settled; transformed streams seek to the nearest keyframe. */
const SEEK_SETTLED_TOLERANCE_MS = 1_500;

/**
 * Allowance above the node's segment hold for the player to handle the answer.
 * Matches core's `HLS_WALK_HOLD_MARGIN_MS`. Not sized against media3's segment
 * retry behaviour, which is unverified.
 */
const SEEK_HOLD_MARGIN_MS = 2_000;

/**
 * How long a pending seek or supersede may excuse player reports and errors,
 * so a seek that never lands cannot freeze the position for ever.
 *
 * The serving node's `segmentHoldMs` plus a margin; `SERVER_SEGMENT_HOLD_MS`
 * stands in when the node has not said (older node, status not yet loaded, or
 * no `view_status` role).
 */
function seekDeadlineMs(session: PlaybackSession | undefined): number {
  const stated = session?.source.budgets?.segmentHoldMs;
  return (stated === undefined ? SERVER_SEGMENT_HOLD_MS : Math.max(0, stated)) + SEEK_HOLD_MARGIN_MS;
}

/**
 * Where a generation's media begins on the title's timeline.
 *
 * Core's `PlaybackCoordinator` normally converts between title and generation
 * timelines; this client drives `ClusterPlaybackResolver` without one, so these
 * three functions do it. Not a double correction unless a coordinator is added.
 *
 * The origin is `seekMs`, not `seekOffsetMs` (0 on transcode; on remux the
 * remainder is inside `seekRequestedMs`). Direct play is the whole file, origin 0.
 */
export function generationOriginMs(session: PlaybackSession | undefined): number {
  // No session: a downloaded original played from disk.
  if (!session || !session.source.isManifest) return 0;
  return Math.max(0, session.seekMs ?? 0);
}

/** A player-reported position on the title's timeline, which everything above the player uses. */
export function titlePositionMs(session: PlaybackSession | undefined, reportedMs: number): number {
  return generationOriginMs(session) + Math.max(0, reportedMs);
}

/** A title position on the player's own timeline, for writing to `currentTime`. */
export function generationLocalMs(session: PlaybackSession | undefined, titleMs: number): number {
  return Math.max(0, titleMs - generationOriginMs(session));
}

/**
 * Whether a reported position is still the pre-seek one and should be ignored.
 * Both engines report the old position for a few frames after a seek, which
 * would drag the bar back and checkpoint the stale position.
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
 * expo-video's pre-API-26 duck halves `player.volume`, and the setter also
 * overwrites the `userVolume` it restores from, so ducks compound permanently.
 * API 26+ ducks at the mixer and never reaches this path; `minSdkVersion` is 24.
 * Returning `undefined` when nothing dropped keeps the caller loop-safe, since
 * writing the volume emits another `volumeChange`.
 */
export function restoredVolume(reported: number, intended: number): number | undefined {
  return reported < intended ? intended : undefined;
}

/**
 * Whether a seek must reposition the *generation* rather than just the player.
 *
 * The node refuses a segment far past its production window
 * (`beyond_hold_window`), which media3 treats as fatal and would read as a bad
 * node; a seek-only PATCH moves production instead. Keyed on the player's
 * buffered end because the node's window is not visible here, and a needless
 * reposition is cheap. Forward seeks only: far backward seeks are unverified.
 */
export function seekRequiresReposition(
  session: PlaybackSession | undefined,
  targetMs: number,
  bufferedEndMs: number,
): boolean {
  // No session: a downloaded original played from disk.
  if (!session) return false;
  // Direct play is a byte range over a complete file; every offset is servable.
  if (!session.source.isManifest) return false;
  return targetMs > bufferedEndMs;
}

/** A generation change this client requested; `settledAtMs` is set when the PATCH answers, either way. */
export interface PendingSupersede {
  startedAtMs: number;
  settledAtMs?: number;
}

/**
 * Whether this client has just superseded its own generation.
 *
 * A fragment of the superseded generation answers `410 generation_superseded`
 * from a healthy node; failing over on it would drop the picture, spend budget
 * and blame the node. Suppresses while the PATCH is in flight and for
 * `seekDeadlineMs` after. Kept narrow so a dead node still fails over;
 * expo-video does not expose the status, so only self-caused supersession is covered.
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
 * How long a player error must persist before anything acts on it. expo-video
 * does not say which source an error came from and a replaced source keeps
 * reporting, so only a persistent error is trusted.
 */
export function errorSettleMs(session: PlaybackSession | undefined): number {
  return seekDeadlineMs(session);
}

/** What `sessionAlive` said about the session a failing player was reading. */
export type ProbeOutcome = 'alive' | 'gone' | 'unknown-provenance' | 'unreachable';

/**
 * Classify the owning node's answer to "do you still hold this session?".
 *
 * `false` means reaped. A throw is either an id core cannot place
 * (`SESSION_PROVENANCE_UNKNOWN_CODE`, matched on code) or an unanswerable
 * probe. A released session also answers `false`, so the error must be
 * attributed to the current generation before probing.
 */
export function classifyProbe(result: { alive: boolean } | { error: unknown }): ProbeOutcome {
  if ('alive' in result) return result.alive ? 'alive' : 'gone';
  return playbackFailureCode(result.error) === SESSION_PROVENANCE_UNKNOWN_CODE ? 'unknown-provenance' : 'unreachable';
}

/**
 * Regenerate on the same node, or fail over.
 *
 * - `gone`: regenerate on the same node without charging it (others would 404).
 *   A repeat regeneration at the same millisecond fails over instead of looping,
 *   as core's `session-regeneration-made-no-progress`.
 * - `alive`: fail over; expo-video hides the status, so a live plan's past-end
 *   404 cannot be told apart.
 * - `unknown-provenance`: fail over (core stops). It arises only when the
 *   resolver was rebuilt and the serving node has left the cluster.
 * - `unreachable`: fail over.
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
 * When a declined error must reach the viewer. The guard cannot tell a stale
 * old-generation fragment from the new generation failing, so wait out its
 * window, then report if the caller finds the player still in error. While the
 * PATCH is in flight, look again a whole deadline later.
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
 * Whether a player error is evidence against the *endpoint*.
 *
 * A fatal error during an outstanding seek on a generation still being
 * produced means the target does not exist yet, not that the node failed.
 * Kept narrow: outside that window an error blames the endpoint, so a dead
 * node does not strand the viewer.
 */
export function errorBlamesEndpoint(
  session: PlaybackSession | undefined,
  pendingSeek: PendingSeek | undefined,
  nowMs: number,
  pendingSupersede?: PendingSupersede,
): boolean {
  // Before the session guard: a mode switch is in flight whatever the current source.
  if (selfSupersededGeneration(pendingSupersede, session, nowMs)) return false;
  if (!session || !pendingSeek) return true;
  // Direct play has no production to outrun.
  if (!session.source.isManifest) return true;
  return nowMs - pendingSeek.atMs >= seekDeadlineMs(session);
}

/**
 * Which of an item's files to play, and how. The file is always named, since
 * the server would otherwise play its own first choice. Ranking is core's
 * `chooseAmongFiles`; the duration is the chosen file's.
 */
export function chooseFile(
  files: readonly PlaybackMediaFacts[],
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides?: PlaybackPolicyOverrides,
): { instruction: PlaybackInstruction; durationMs: number; mediaId?: string } | undefined {
  const choice = chooseAmongFiles(files, capabilities, { overrides }, mediaIds);
  if (!choice) return undefined;
  return { instruction: choice.instruction, durationMs: files[choice.index]!.profile.durationMs, mediaId: choice.mediaId };
}

/**
 * Which file to play when the mode was decided elsewhere (viewer choice or a
 * download). The file `chooseFile` would pick; an only file names itself. With
 * several files and no facts, none is named and core's resolver falls back to
 * stored order.
 */
export function fileToPlay(
  files: readonly PlaybackMediaFacts[] | undefined,
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides?: PlaybackPolicyOverrides,
): string | undefined {
  if (mediaIds.length <= 1) return mediaIds[0];
  return files ? chooseFile(files, mediaIds, capabilities, overrides)?.mediaId : undefined;
}
