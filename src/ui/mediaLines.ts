import { fileSummaries, type CatalogueMediaProfile, type MediaTechnicalProfile, type TechnicalSummary } from '@machafoundation/core';

/**
 * Technical lines per file. Facts and labels come from core (`fileSummaries`);
 * this module only lays them out, e.g.
 * "2h 31m · 3840×2160 (4K) · HEVC · TRUEHD · 7.1 · 47.4 Mbps" or
 * "3:45 · FLAC · 24-bit · 96 kHz · Stereo · 2,304 kbps".
 */

const SEPARATOR = ' · ';

/** A summary's parts on one line, in core's order. */
export function summaryLine(summary: TechnicalSummary): string {
  return summary.parts.join(SEPARATOR);
}

/**
 * One line per distinct file; files with identical facts share a line.
 *
 * TODO: identical files are likely duplicates; report them once the server
 * has a route for it.
 */
export function fileLines(profiles: readonly (CatalogueMediaProfile | MediaTechnicalProfile)[]): string[] {
  return fileSummaries(profiles).map(({ summary }) => summaryLine(summary));
}

/** Makes a line wrap only at separators by turning spaces inside fields into no-break spaces. */
export function wrapBetweenFields(line: string): string {
  return line
    .split(SEPARATOR)
    .map((field) => field.replace(/ /g, ' '))
    .join(SEPARATOR);
}
