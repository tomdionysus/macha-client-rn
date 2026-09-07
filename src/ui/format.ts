/** Presentation-only formatting. Nothing here parses or validates wire data. */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

/** A compact runtime for detail screens: `1 h 47 m`, `38 m`. */
export function formatRuntime(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} m`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} m`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatBitrate(bitsPerSecond: number | undefined): string | undefined {
  if (!bitsPerSecond || !Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return undefined;
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

export function formatLanguage(code: string | undefined): string {
  const value = code?.trim();
  if (!value || value === 'und') return 'Unknown';
  const names = LANGUAGE_NAMES[value.toLowerCase()];
  return names ?? value.toUpperCase();
}

/**
 * Just enough of ISO 639 to name the tracks that actually turn up in a home
 * media library. Anything else falls back to the raw code, which is still more
 * useful than hiding it.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  eng: 'English',
  es: 'Spanish',
  fi: 'Finnish',
  fr: 'French',
  fre: 'French',
  ga: 'Irish',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  zh: 'Chinese',
};

export function formatChannels(channels: number | undefined): string | undefined {
  if (!channels || channels <= 0) return undefined;
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels} ch`;
}

/** A one-line technical summary of a stream, for option lists. */
export function describeStream(stream: {
  codec?: string;
  channels?: number;
  bitrate?: number;
  height?: number;
}): string {
  return [
    stream.height ? `${stream.height}p` : undefined,
    stream.codec ? stream.codec.toUpperCase() : undefined,
    formatChannels(stream.channels),
    formatBitrate(stream.bitrate),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
