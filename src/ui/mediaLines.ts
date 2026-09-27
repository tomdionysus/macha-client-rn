import type { CatalogueMediaProfile } from '@machafoundation/core';

/**
 * One line per file, the same on every client (Tom, 2026-09-27: "Copy the
 * web style, formatted for the device screen", and the music line likewise).
 * The rules are the web client's (`macha-client` `e31635a`,
 * `src/screens/DetailScreen.tsx`); this is a copy of them, kept word for
 * word so the phone, the television and the web read alike. If core ever
 * takes them, this file goes.
 *
 * A film or an episode: "2h 31m · 3840×2160 · HEVC · TRUEHD · 47.4 Mbps".
 * A track: "3:45 · FLAC · 24-bit · 96 kHz · Stereo · 2,304 kbps".
 */

/**
 * Files whose lines read the same (length, resolution, codecs and bitrate)
 * share one line (Tom, 2026-09-27).
 *
 * TODO: files identical in all of these are very likely the same media
 * stored twice. Report them to the server once it has a route for flagging
 * duplicates, rather than only hiding the repeat here.
 */
export function fileLines(profiles: readonly CatalogueMediaProfile[]): string[] {
  return [...new Set(profiles.map(mediaProfileSummary))];
}

export function codecLabel(codec: string): string {
  const normalized = codec.trim().toLowerCase();
  if (normalized === 'h264') return 'H.264';
  if (normalized === 'hevc' || normalized === 'h265') return 'HEVC';
  if (normalized === 'aac') return 'AAC';
  if (normalized === 'ac3') return 'AC-3';
  if (normalized === 'eac3') return 'E-AC-3';
  return codec.toUpperCase();
}

function channelsLabel(channels: number): string {
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels}ch`;
}

/** A track's length as a player shows it: "3:45", or "1:02:03" past an hour. */
function trackLength(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The audio a line names: the file's default track, else its first. A film
 * can carry eight (TrueHD, DTS, AC-3 and more), and the default is the one
 * that plays.
 */
function lineAudio(profile: CatalogueMediaProfile) {
  return profile.streams.find((stream) => stream.type === 'audio' && stream.default)
    ?? profile.streams.find((stream) => stream.type === 'audio');
}

/** A file with no picture: its resolution in bits and samples, not a picture's. */
function audioProfileSummary(profile: CatalogueMediaProfile): string {
  const audio = lineAudio(profile);
  const parts: string[] = [];
  if (profile.duration_ms > 0) parts.push(trackLength(profile.duration_ms));
  if (audio?.codec) parts.push(codecLabel(audio.codec));
  if (audio && audio.bit_depth > 0) parts.push(`${audio.bit_depth}-bit`);
  if (audio && audio.sample_rate > 0) parts.push(`${Number((audio.sample_rate / 1000).toFixed(1))} kHz`);
  if (audio && audio.channels > 0) parts.push(channelsLabel(audio.channels));
  // Grouped by hand: Hermes' `toLocaleString` is not guaranteed to group.
  if (profile.bitrate > 0) parts.push(`${String(Math.round(profile.bitrate / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} kbps`);
  return parts.join(' · ');
}

export function mediaProfileSummary(profile: CatalogueMediaProfile): string {
  const video = profile.streams.find((stream) => stream.type === 'video' && !stream.attached_picture);
  if (!video) return audioProfileSummary(profile);
  const parts: string[] = [];
  const minutes = Math.floor(profile.duration_ms / 60_000);
  if (minutes >= 60) parts.push(`${Math.floor(minutes / 60)}h ${minutes % 60}m`);
  else if (minutes > 0) parts.push(`${minutes}m`);
  const audio = lineAudio(profile);
  if (video.width && video.height) parts.push(`${video.width}×${video.height}`);
  if (video.codec) parts.push(codecLabel(video.codec));
  if (audio?.codec) parts.push(codecLabel(audio.codec));
  if (profile.bitrate > 0) parts.push(`${(profile.bitrate / 1_000_000).toFixed(1)} Mbps`);
  return parts.join(' · ');
}

/**
 * A line as a narrow screen should wrap it: only between fields, never
 * inside one. The music player's column on the A85 (2026-09-27) broke "926
 * kbps" across two lines; every space inside a field becomes a no-break
 * space, so a break can only fall at " · " (agreed with the web client).
 */
export function wrapBetweenFields(line: string): string {
  return line
    .split(' · ')
    .map((field) => field.replace(/ /g, '\u00A0'))
    .join(' · ');
}
