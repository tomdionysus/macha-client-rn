import { fileSummaries, type CatalogueMediaProfile, type MediaTechnicalProfile, type TechnicalSummary } from '@machafoundation/core';

/**
 * One line per file, the same on every client. The facts and their labels
 * are core's (`technicalSummary`, `fileSummaries`, core `5622020`): Tom,
 * 2026-09-27, format, codec, bitrate and the like "are non i18n and
 * technical. They are core's responsibility, but should be supplied to
 * clients in a structured object. The client should still 'format' them, in
 * terms of layout." What is left here is the phone's layout: the separator,
 * and wrapping only between fields.
 *
 * A film or an episode: "2h 31m · 3840×2160 (4K) · HEVC · TRUEHD · 7.1 ·
 * 47.4 Mbps", files highest resolution first.
 * A track: "3:45 · FLAC · 24-bit · 96 kHz · Stereo · 2,304 kbps".
 */

const SEPARATOR = ' · ';

/** A summary's parts on one line, in core's order. */
export function summaryLine(summary: TechnicalSummary): string {
  return summary.parts.join(SEPARATOR);
}

/**
 * One line per distinct file. Files whose facts read the same share one, as
 * core combines them (Tom, 2026-09-27).
 *
 * TODO: files identical in all of these are very likely the same media
 * stored twice. Report them to the server once it has a route for flagging
 * duplicates, rather than only hiding the repeat here.
 */
export function fileLines(profiles: readonly (CatalogueMediaProfile | MediaTechnicalProfile)[]): string[] {
  return fileSummaries(profiles).map(({ summary }) => summaryLine(summary));
}

/**
 * A line as a narrow screen should wrap it: only between fields, never
 * inside one. The music player's column on the A85 (2026-09-27) broke "926
 * kbps" across two lines; every space inside a field becomes a no-break
 * space, so a break can only fall at the separator (agreed with the web
 * client).
 */
export function wrapBetweenFields(line: string): string {
  return line
    .split(SEPARATOR)
    .map((field) => field.replace(/ /g, ' '))
    .join(SEPARATOR);
}
