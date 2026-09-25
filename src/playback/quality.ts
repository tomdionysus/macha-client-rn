import {
  QualityPreferenceStore,
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
  type QualityCeiling,
  type QualityClass,
  type VersionStep,
} from '@machafoundation/core';
import { Dimensions } from 'react-native';
import { clientStore } from '../state/storage';

/**
 * Per-quality play and the ceilings on automatic play (Tom, 2026-09-25; the
 * design is in TODO/ACTIVE.md).
 *
 * The judgement is core's: `playbackVersions` says which qualities an item
 * has and what automatic play takes, `qualityCeiling` what caps it. This
 * client drives the resolver directly and constructs no coordinator, so what
 * the coordinator does around them is repeated here, in one place, as core
 * described it for a resolver-direct host.
 */

/**
 * The viewer's ceilings on this device. Core keeps none of them; the store
 * and its key are core's so that every client keeps the setting alike.
 */
export const qualityPreferences = new QualityPreferenceStore(clientStore);

/**
 * NetInfo's connection type as core's three kinds. Ethernet is Wi-Fi's
 * ceiling, not mobile data's; anything NetInfo cannot name counts as Wi-Fi,
 * which is core's rule too.
 */
export function connectionKindOf(type: string | undefined): ConnectionKind {
  if (type === 'cellular') return 'cellular';
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  return 'unknown';
}

let connection: ConnectionKind = 'unknown';

/** Set from `MachaProvider`'s NetInfo listener, the one place that has it. */
export function setConnectionKind(kind: ConnectionKind): void {
  connection = kind;
}

export function currentConnectionKind(): ConnectionKind {
  return connection;
}

/**
 * The panel in physical pixels, stated landscape. `screen` rather than
 * `window`, because the window loses the system bars and the panel does not;
 * landscape because a picture is, and a portrait 1080x2400 read as it stands
 * would be classed by its 2400 height as a 2160p display.
 */
export function displayPixels(): { width: number; height: number } | undefined {
  const { width, height, scale } = Dimensions.get('screen');
  const long = Math.round(Math.max(width, height) * scale);
  const short = Math.round(Math.min(width, height) * scale);
  return long > 0 && short > 0 ? { width: long, height: short } : undefined;
}

/** The cap on automatic play here and now. A viewer's pick is never capped. */
export function deviceQualityCeiling(): QualityCeiling | undefined {
  return qualityCeiling({
    display: displayPixels(),
    preference: qualityPreferences.get(),
    connection: currentConnectionKind(),
  });
}

/** How a step reads on a button or in the sheet. */
export function qualityLabel(quality: QualityClass): string {
  return `${quality}p`;
}

/**
 * Why automatic play took less than the item's best, for the viewer. The
 * reason codes are core's; the words are ours.
 */
export function ceilingExplanation(ceiling: QualityCeiling): string {
  const cap = qualityLabel(ceiling.quality);
  switch (ceiling.reason) {
    case 'ceiling-cellular':
      return `On mobile data, Play is limited to ${cap}. Choose a quality to override it, or change the limit in Settings.`;
    case 'ceiling-preference':
      return `Play is limited to ${cap} by your setting. Choose a quality to override it, or change it in Settings.`;
    case 'ceiling-display':
      return `Play picks ${cap} to match this screen. Choose a quality to play a larger one.`;
  }
}

/**
 * Whether an item's qualities are worth offering: more than one, or one the
 * ceiling kept automatic play off. A single step that Play already takes is
 * the same button twice.
 */
export function offersVersions(versions: PlaybackVersions | undefined): versions is PlaybackVersions {
  return !!versions && (versions.steps.length > 1 || (versions.limitedBy !== undefined && versions.steps.length > 0));
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
 * Automatic play: the best file at or below the ceiling, or a capped
 * transcode where every file is above it. Its streams are named from that
 * file's facts, as the coordinator names them, because a 0.58.0 node refuses
 * a create on a file with several audio streams that names none.
 *
 * `preferences` are the ones the caller is starting with, for the languages
 * a stream is chosen by. Undefined only when there are no files.
 */
export function automaticStart(
  files: readonly FileFacts[],
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides | undefined,
  ceiling: QualityCeiling | undefined,
  preferences: PlaybackPreferencesUpdate = {},
): StartChoice | undefined {
  const versions = playbackVersions(files, capabilities, { overrides, mediaIds, ...(ceiling ? { ceiling } : {}) });
  const step = versions.automatic;
  if (!step) return undefined;
  return { ...stepStart(step, files, preferences), versions };
}

/**
 * A quality the viewer picked, started fresh. Never capped: its preferences
 * name a concrete mode, and nothing re-ranks the file it names.
 */
export function versionStart(
  step: VersionStep,
  files: readonly FileFacts[],
  mediaIds: readonly string[],
  capabilities: PlaybackCapabilities,
  overrides: PlaybackPolicyOverrides | undefined,
  preferences: PlaybackPreferencesUpdate = {},
): StartChoice {
  return { ...stepStart(step, files, preferences), versions: playbackVersions(files, capabilities, { overrides, mediaIds }) };
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
 * **The height cap is always stated**, `null` for a file played as it is.
 * `restatePreferencesClearedByMode` carries the session's cap into any
 * transcode that names none, which is right for a Mode change and wrong
 * here: after a capped 720p, picking the 1080p file would come back capped.
 *
 * On the same file the streams are left to `preparePlaybackPatch`, which
 * restates the ones playing. On another file they are named from that file's
 * facts, in the languages playing now, since the old file's stream indexes
 * mean nothing on the new one (core's rule for a file switch).
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
  return {
    mediaId,
    preferences: {
      ...preferences,
      ...(profile
        ? streamsToName(profile, step.instruction.mode, {
            ...(audioLanguage ? { audioLanguage } : {}),
            ...(subtitleLanguage ? { subtitleLanguage } : {}),
          })
        : {}),
    },
  };
}

/**
 * Which step the session is playing, if any: its file, capped as that step
 * caps it. A session on a file no step names, or capped by some other
 * control, is none of them.
 */
export function playingStep(steps: readonly VersionStep[], session: PlaybackSession | undefined): VersionStep | undefined {
  if (!session) return undefined;
  const cap = session.preferences.maxHeight ?? null;
  return steps.find(
    (step) =>
      (step.mediaId === undefined || step.mediaId === session.mediaId) &&
      (step.source === 'file' ? cap === null : cap === step.maxHeight),
  );
}
