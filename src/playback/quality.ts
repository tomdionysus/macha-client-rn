import {
  QualityPreferenceStore,
  qualityLabel,
  playbackVersions,
  qualityCeiling,
  streamsToName,
  versionPreferences,
  type ConnectionKind,
  type FileFacts,
  type PlaybackCapabilities,
  type PlaybackInstruction,
  type PlaybackPolicyOverrides,
  type PlaybackPreferencesUpdate,
  type PlaybackSession,
  type PlaybackUpdate,
  type PlaybackVersions,
  type PlaybackVersionsOptions,
  type QualityCeiling,
  type QualityClass,
  type VersionStep,
} from '@machafoundation/core';
import { clientStore } from '../state/storage';
import { displayPixels } from './capabilities';

/**
 * Per-quality play and the ceilings on automatic play. The judgement is core's
 * (`playbackVersions`, `qualityCeiling`); this client has no coordinator, so
 * the coordinator's handling around them lives here.
 */

/** The viewer's quality ceilings on this device, in core's store and key so every client keeps them alike. */
export const qualityPreferences = new QualityPreferenceStore(clientStore);

/** NetInfo's connection type as core's kinds: ethernet counts as Wi-Fi; anything unnamed is `unknown`. */
export function connectionKindOf(type: string | undefined): ConnectionKind {
  if (type === 'cellular') return 'cellular';
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  return 'unknown';
}

let connection: ConnectionKind = 'unknown';

/** Set from `MachaProvider`'s NetInfo listener. */
export function setConnectionKind(kind: ConnectionKind): void {
  connection = kind;
}

export function currentConnectionKind(): ConnectionKind {
  return connection;
}

/** The cap on automatic play here and now. A viewer's pick is never capped. */
export function deviceQualityCeiling(): QualityCeiling | undefined {
  return qualityCeiling({
    display: displayPixels(),
    preference: qualityPreferences.get(),
    connection: currentConnectionKind(),
  });
}

/** Core's label for a step ("4K", "2K", "1080p"). */
export { qualityLabel } from '@machafoundation/core';

/** "its video", "its audio", "its video and audio", or undefined for neither. */
export function convertedStreams(video: boolean, audio: boolean): string | undefined {
  return video && audio ? 'its video and audio' : video ? 'its video' : audio ? 'its audio' : undefined;
}

/**
 * Why Play chooses the file it does, in one sentence: the file chosen, a larger
 * one passed over for needing conversion (`passedOver`), and a ceiling that kept
 * a larger one out (`limitedBy`). Worded as the web client's, so clients agree.
 * Undefined when Play is choosing the largest file, which needs no explaining.
 */
export function qualityChoiceText(versions: Pick<PlaybackVersions, 'files' | 'automatic' | 'limitedBy' | 'passedOver'>): string | undefined {
  const { automatic, limitedBy, passedOver } = versions;
  if (!automatic) return undefined;
  const clauses: string[] = [];
  const converted = passedOver && convertedStreams(passedOver.converts.video, passedOver.converts.audio);
  // Conversion is needed and also slower than real time on every measured node.
  const tooSlow = passedOver?.reasons.includes('transcode-below-real-time');
  if (passedOver && converted) {
    clauses.push(`${qualityLabel(passedOver.quality)} needs ${converted} converted${tooSlow ? ', which the server can\'t do fast enough' : ''}`);
  }
  const above = limitedBy
    ? Math.max(...versions.files.map((file) => file.quality).filter((quality) => quality > limitedBy.quality))
    : Number.NEGATIVE_INFINITY;
  if (limitedBy && Number.isFinite(above)) {
    const larger = qualityLabel(above as QualityClass);
    clauses.push(limitedBy.reason === 'ceiling-display' ? `${larger} is more than this screen shows`
      : limitedBy.reason === 'ceiling-device' ? `${larger} is more than this device plays`
        : limitedBy.reason === 'ceiling-cellular' ? `${larger} is more than Play uses on mobile data`
          : `${larger} is more than the most set in Settings`);
  }
  if (clauses.length === 0) return undefined;
  const plays = automatic.instruction.video !== 'transcode' && automatic.instruction.audio !== 'transcode';
  const chosen = `Play chooses ${qualityLabel(automatic.quality)}${passedOver && converted && plays ? ', which plays without converting' : ''}.`;
  return `${chosen} ${clauses.join(', and ')}. Pick a quality to play another.`;
}

/**
 * The best measured transcode rate per kind of picture, from the resolver.
 * Passed on every `playbackVersions` call so automatic play skips files no
 * node converts at real speed.
 */
export type TranscodeRate = PlaybackVersionsOptions['transcodeRate'];

/** Whether the viewer turned off the device limit; kept in core's store with the ceilings. */
export function offerAll(): boolean {
  return qualityPreferences.get().offerAll === true;
}

/**
 * Whether an item's qualities are worth a button each: more than one, or one
 * that differs from what Play would take. What is offered is core's decision
 * (`playbackVersions`, nothing above this device unless `offerAll`).
 */
export function offersVersions(versions: PlaybackVersions | undefined): versions is PlaybackVersions {
  if (!versions) return false;
  const automatic = versions.automatic?.quality;
  return versions.steps.length > 1 || versions.steps.some((step) => step.quality !== automatic);
}

/** What a create asks for: the instruction, its file, and the preferences that go with them. */
export interface StartChoice {
  instruction: PlaybackInstruction;
  durationMs: number;
  mediaId?: string;
  /** The height cap and the streams named, merged into the create's preferences. */
  preferences: PlaybackPreferencesUpdate;
  versions: PlaybackVersions;
}

function factsFor(files: readonly FileFacts[], mediaId: string | undefined): FileFacts | undefined {
  return (mediaId !== undefined ? files.find((file) => file.mediaId === mediaId) : undefined) ?? files[0];
}

/**
 * Automatic play: the best file at or below the ceiling, or a capped transcode
 * when every file is above it. Streams are named from that file's facts, since
 * the node refuses a create on a multi-audio file that names none. `preferences`
 * supply the languages to choose by. Undefined only when there are no files.
 */
export function automaticStart(
  files: readonly FileFacts[],
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides | undefined,
  ceiling: QualityCeiling | undefined,
  preferences: PlaybackPreferencesUpdate = {},
  transcodeRate?: TranscodeRate,
): StartChoice | undefined {
  const versions = playbackVersions(files, capabilities, { overrides, mediaIds, offerAll: offerAll(), transcodeRate, ...(ceiling ? { ceiling } : {}) });
  const step = versions.automatic;
  if (!step) return undefined;
  return { ...stepStart(step, files, preferences), versions };
}

/** A quality the viewer picked, started fresh. Never capped or re-ranked. */
export function versionStart(
  step: VersionStep,
  files: readonly FileFacts[],
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides | undefined,
  preferences: PlaybackPreferencesUpdate = {},
  transcodeRate?: TranscodeRate,
): StartChoice {
  return {
    ...stepStart(step, files, preferences),
    versions: playbackVersions(files, capabilities, { overrides, mediaIds, offerAll: offerAll(), transcodeRate }),
  };
}

function stepStart(
  step: VersionStep,
  files: readonly FileFacts[],
  preferences: PlaybackPreferencesUpdate,
): Omit<StartChoice, 'versions'> {
  const file = factsFor(files, step.mediaId);
  const { mediaId, ...stated } = versionPreferences(step);
  return {
    instruction: step.instruction,
    durationMs: file?.profile.durationMs ?? 0,
    ...(mediaId !== undefined ? { mediaId } : {}),
    preferences: {
      ...(stated.maxHeight !== undefined ? { maxHeight: stated.maxHeight } : {}),
      ...(file ? streamsToName(file.profile, step.instruction.mode, preferences) : {}),
    },
  };
}

/**
 * The PATCH that switches a playing session to a picked quality.
 *
 * The height cap is always stated (`null` for an uncapped file), otherwise
 * `restatePreferencesClearedByMode` would carry the old cap into the new pick.
 * On the same file `preparePlaybackPatch` restates the playing streams; on
 * another file streams are named from its facts in the current languages,
 * since stream indexes do not carry across files.
 */
export function versionUpdate(
  step: VersionStep,
  session: PlaybackSession,
  files: readonly FileFacts[] | undefined,
): PlaybackUpdate {
  const { mediaId, ...stated } = versionPreferences(step);
  const preferences: PlaybackPreferencesUpdate = { ...stated, maxHeight: stated.maxHeight ?? null };
  const switching = mediaId !== undefined && mediaId !== session.mediaId;
  if (!switching) return { preferences };
  const profile = files?.find((file) => file.mediaId === mediaId)?.profile;
  const languageOf = (index: number) =>
    index >= 0 ? session.sourceInfo.streams.find((stream) => stream.index === index)?.language || undefined : undefined;
  const audioLanguage = languageOf(session.selected.audioStream);
  const subtitleLanguage = languageOf(session.selected.subtitleStream);
  // Keep the subtitle kind too: forced stays forced, full stays full, since a
  // file may flag its forced track as default.
  const subtitleForced = subtitleLanguage
    ? session.sourceInfo.streams.find((stream) => stream.index === session.selected.subtitleStream)?.forced
    : undefined;
  return {
    mediaId,
    preferences: {
      ...preferences,
      ...(profile
        ? streamsToName(profile, step.instruction.mode, {
            ...(audioLanguage ? { audioLanguage } : {}),
            ...(subtitleLanguage ? { subtitleLanguage } : {}),
            ...(subtitleForced !== undefined ? { subtitleForced } : {}),
          })
        : {}),
    },
  };
}

/** The step the session is playing (same file, same cap), if any. */
export function playingStep(steps: readonly VersionStep[], session: PlaybackSession | undefined): VersionStep | undefined {
  if (!session) return undefined;
  const cap = session.preferences.maxHeight ?? null;
  return steps.find(
    (step) =>
      (step.mediaId === undefined || step.mediaId === session.mediaId) &&
      (step.source === 'file' ? cap === null : cap === step.maxHeight),
  );
}
