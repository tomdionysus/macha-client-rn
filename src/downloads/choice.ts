import { fileSummaries, type CatalogueMediaProfile, type MediaSummary, type MediaTechnicalProfile } from '@machafoundation/core';
import { summaryLine } from '../ui/mediaLines';
import { formatBytes } from '../ui/format';

/** One file a viewer can name for a download. */
export interface DownloadChoice {
  mediaId: string;
  /** The file's quality, core's label: "4K", "1080p". */
  label: string;
  /** Its media line, and roughly how much of the phone it takes. */
  detail: string;
}

/**
 * The files of a title as a download chooser lists them (Tom, 2026-09-28):
 * core's summaries, largest first, with files that read the same offered
 * once. The size is an estimate from the overall bitrate and the length,
 * since a profile carries no byte count, so it says "about".
 */
export function downloadChoices(profiles: readonly (CatalogueMediaProfile | MediaTechnicalProfile)[]): DownloadChoice[] {
  return fileSummaries(profiles).flatMap(({ summary, mediaIds }) => {
    const mediaId = mediaIds[0];
    if (!mediaId) return [];
    const profile = profiles.find((candidate) => idOf(candidate) === mediaId);
    const bytes = profile ? (bitrateOf(profile) * durationOf(profile)) / 8000 : 0;
    const size = bytes > 0 ? `about ${formatBytes(bytes)}` : undefined;
    return [
      {
        mediaId,
        label: summary.quality?.label ?? 'This file',
        detail: [summaryLine(summary), size].filter(Boolean).join(' · '),
      },
    ];
  });
}

/**
 * Which record a download is stored under, and whether the viewer named the
 * file. A named file keys the record, so the title reads as downloaded by
 * that file; otherwise the first file keys it and the download takes the
 * file playback would pick, as before.
 */
export function downloadTarget(
  media: Pick<MediaSummary, 'mediaIds'>,
  chosen?: string,
): { mediaId: string; fileChosen: boolean } | undefined {
  if (chosen && media.mediaIds.includes(chosen)) return { mediaId: chosen, fileChosen: true };
  const first = media.mediaIds[0];
  return first ? { mediaId: first, fileChosen: false } : undefined;
}

function idOf(profile: CatalogueMediaProfile | MediaTechnicalProfile): string {
  return 'media_id' in profile ? profile.media_id : profile.mediaId;
}

function durationOf(profile: CatalogueMediaProfile | MediaTechnicalProfile): number {
  return 'duration_ms' in profile ? profile.duration_ms : profile.durationMs;
}

function bitrateOf(profile: CatalogueMediaProfile | MediaTechnicalProfile): number {
  return profile.bitrate;
}
