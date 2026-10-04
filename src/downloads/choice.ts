import {
  choosePlaybackInstruction,
  fileSummaries,
  type MediaSummary,
  type PlaybackCapabilities,
  type PlaybackMediaFacts,
  type PlaybackPolicyOverrides,
} from '@machafoundation/core';
import { summaryLine } from '../ui/mediaLines';
import { formatBytes } from '../ui/format';

/** What the viewer is told about a file this device cannot play off the disk. */
export const NOT_AVAILABLE_HERE = 'Not available for this device';

/** One file a viewer can name for a download. */
export interface DownloadChoice {
  mediaId: string;
  /** The file's quality, core's label: "4K", "1080p". */
  label: string;
  /** Its media line and its size, or why it cannot be downloaded here. */
  detail: string;
  /** Whether this device can play the copy. */
  available: boolean;
}

/**
 * Whether this device plays a file off the disk as it is. A downloaded copy
 * always plays Direct, so this asks core's chooser about the device alone,
 * ignoring the node's operations.
 */
export function playableHere(
  file: PlaybackMediaFacts,
  capabilities: PlaybackCapabilities,
  overrides?: PlaybackPolicyOverrides,
): boolean {
  return choosePlaybackInstruction(file.profile, capabilities, overrides ? { overrides } : {}).mode === 'direct';
}

/**
 * A title's files for the download chooser: core's summaries, largest first,
 * duplicates once. Size is the node's, else estimated from bitrate and length
 * as "about".
 */
export function downloadChoices(
  files: readonly PlaybackMediaFacts[],
  capabilities: PlaybackCapabilities,
  overrides?: PlaybackPolicyOverrides,
): DownloadChoice[] {
  return fileSummaries(files.map((file) => file.profile)).flatMap(({ summary, mediaIds }) => {
    const file = files.find((candidate) => candidate.mediaId === mediaIds[0]);
    if (!file) return [];
    const available = playableHere(file, capabilities, overrides);
    const estimate = (file.profile.bitrate * file.profile.durationMs) / 8000;
    const size = file.sizeBytes ? formatBytes(file.sizeBytes) : estimate > 0 ? `about ${formatBytes(estimate)}` : undefined;
    return [
      {
        mediaId: file.mediaId,
        label: summary.quality?.label ?? 'This file',
        detail: [summaryLine(summary), size, available ? undefined : NOT_AVAILABLE_HERE].filter(Boolean).join(' · '),
        available,
      },
    ];
  });
}

/**
 * The record key for a download: the viewer's chosen file, else the first
 * file (and the download then takes whichever file playback would pick).
 */
export function downloadTarget(
  media: Pick<MediaSummary, 'mediaIds'>,
  chosen?: string,
): { mediaId: string; fileChosen: boolean } | undefined {
  if (chosen && media.mediaIds.includes(chosen)) return { mediaId: chosen, fileChosen: true };
  const first = media.mediaIds[0];
  return first ? { mediaId: first, fileChosen: false } : undefined;
}
