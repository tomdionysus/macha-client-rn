import { Platform } from 'react-native';

/**
 * The Macha palette, carried over from the web client's `styles/base.css`:
 * a near-black neutral ground with a highly saturated, very dark crimson
 * accent. Phone screens are viewed in the dark far more often than a TV, so
 * the client is dark-only rather than following the system scheme.
 */
export const colors = {
  background: '#0e0e0f',
  backgroundLift: '#141416',
  surface: '#171719',
  surface2: '#222226',
  surface3: '#2a2a2e',

  text: '#e2e2e5',
  textDim: '#aaaab2',
  textFaint: '#77777f',

  red900: '#050001',
  red800: '#0b0002',
  red700: '#130003',
  red600: '#1e0005',
  red500: '#2c0008',
  red400: '#42000d',

  accent: '#2c0008',
  accentEdge: '#620014',
  accentSurface: 'rgba(19, 0, 3, 0.66)',
  accentSurfaceStrong: 'rgba(38, 0, 7, 0.76)',

  /** Playback progress and "resident buffer" affordances. */
  progress: '#c2415c',
  buffered: 'rgba(194, 65, 92, 0.28)',
  track: 'rgba(226, 226, 229, 0.16)',

  border: 'rgba(226, 226, 229, 0.09)',
  borderStrong: 'rgba(226, 226, 229, 0.16)',
  danger: '#ff6b6b',
  warn: '#e8b33a',
  ok: '#59c07b',
  scrim: 'rgba(6, 6, 7, 0.72)',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 22,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 26, fontWeight: '600' as const, letterSpacing: 0.2 },
  title: { fontSize: 20, fontWeight: '600' as const },
  heading: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.8 },
} as const;

/**
 * The smallest comfortable touch target. Every interactive control in the
 * client is at least this tall — the web/TV client could rely on a focus
 * ring and a pointer, a phone cannot.
 */
export const TOUCH_TARGET = 44;

export const monospace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
