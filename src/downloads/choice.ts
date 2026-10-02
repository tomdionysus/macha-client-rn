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
 * always plays Direct, with nobody to transcode it, so this is core's own
 * chooser asked about the device alone: container, video and audio all have
 * to pass. The node's operations are left out on purpose; the question is
 * the device's.
 */
export function playableHere(
  file: PlaybackMediaFacts,
  capabilities: PlaybackCapabilities,
  overrides?: PlaybackPolicyOverrides,
): boolean {
  return choosePlaybackInstruction(file.profile, capabilities, overrides ? { overrides } : {}).mode === 'direct';
}

/**
 * The files of a title as a download chooser lists them:
 * core's summaries, largest first, with files that read the same offered
 * once. The size is the node's where it gives one; otherwise it is estimated
 * from the overall bitrate and the length, and says "about".
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
 * Which record a download is stored under, and whether the viewer named the
 * file. A named file keys the record, so the title reads as downloaded by
 * that file; otherwise the first file keys it and the download takes the
 * file playback would pick.
 */
export function downloadTarget(
  media: Pick<MediaSummary, 'mediaIds'>,
  chosen?: string,
): { mediaId: string; fileChosen: boolean } | undefined {
  if (chosen && media.mediaIds.includes(chosen)) return { mediaId: chosen, fileChosen: true };
  const first = media.mediaIds[0];
  return first ? { mediaId: first, fileChosen: false } : undefined;
}
