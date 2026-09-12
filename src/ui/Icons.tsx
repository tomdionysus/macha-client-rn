import React from 'react';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from './theme';

export interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Hand-drawn 24-grid glyphs rather than an icon font. The set is small, it
 * keeps the bundle free of a whole typeface, and every glyph can be tuned to
 * the same optical weight as the Macha mark.
 */
function icon(path: string) {
  return function Icon({ size = 24, color = colors.text }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={path}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  };
}

export const HomeIcon = icon('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z');
export const FilmIcon = icon('M3 5h18v14H3zM3 9h18M3 15h18M7.5 5v4M7.5 15v4M16.5 5v4M16.5 15v4');
export const TvIcon = icon('M4 6h16v11H4zM8 21h8M12 17v4');
export const SearchIcon = icon('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4');
export const ChevronLeftIcon = icon('M15 5 8 12l7 7');
export const ChevronRightIcon = icon('M9 5l7 7-7 7');
export const ChevronDownIcon = icon('M5 9l7 7 7-7');
export const CloseIcon = icon('M6 6l12 12M18 6 6 18');
export const SettingsIcon = icon(
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
);
export const RefreshIcon = icon('M20 11a8 8 0 1 0-.6 4M20 5v6h-6');
export const ServerIcon = icon('M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01');
export const SkipBackIcon = icon('M19 5v14L9 12zM5 5v14');
export const SkipForwardIcon = icon('M5 5v14l10-7zM19 5v14');
export const CaptionsIcon = icon('M3 5h18v14H3zM8 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3');
export const LayersIcon = icon('M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5');
export const TrashIcon = icon('M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6');
export const AlertIcon = icon('M12 4 2.5 20h19zM12 10v4M12 17.5h.01');
export const InfoIcon = icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01');
export const ShuffleIcon = icon('M17 4l3 3-3 3M17 14l3 3-3 3M20 7h-4.2a4 4 0 0 0-3.3 1.8l-3 4.4A4 4 0 0 1 6.2 15H3M20 17h-4.2a4 4 0 0 1-3.3-1.8M3 7h3.2a4 4 0 0 1 3.3 1.8');
export const RepeatIcon = icon('M6 3 3 6l3 3M18 21l3-3-3-3M3 6h12a5 5 0 0 1 5 5M21 18H9a5 5 0 0 1-5-5');
export const QueueIcon = icon('M3 6h12M3 12h12M3 18h8M18 10v9M18 10l4-1.5v9L18 19');
export const PlusIcon = icon('M12 5v14M5 12h14');
export const HeartIcon = icon('M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z');
export const DownloadIcon = icon('M12 3v12M7 11l5 5 5-5M4 20h16');
export const DownloadedIcon = icon('M4 20h16M20 7l-9 9-4-4');
export const CloudOffIcon = icon('M3 3l18 18M7 18h9a4 4 0 0 0 1.4-7.7A6 6 0 0 0 8 7.2M6.2 9.3A4 4 0 0 0 7 18');
/** Fullscreen: corner brackets pushing out, and the same pulling in. */
export const ExpandIcon = icon('M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5');
export const CollapseIcon = icon('M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5');
/** A head and shoulders. The only account glyph; there are no avatars in Macha. */
export const UserIcon = icon('M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M5 20c0-3.4 3-5.4 7-5.4s7 2 7 5.4');
/** Corner brackets and a sweep line — the scanner glyph, not a drawn QR. */
export const ScanIcon = icon(
  'M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3M7 12h10',
);
export const SortIcon = icon('M4 7h13M4 12h9M4 17h5M17 13l3 3 3-3M20 16V7');

export function MusicIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18V5l11-2v13"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={6.5} cy={18} r={2.6} stroke={color} strokeWidth={1.8} />
      <Circle cx={17.5} cy={16} r={2.6} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function PlayIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={4.5} width={4} height={15} rx={1.4} fill={color} />
      <Rect x={14} y={4.5} width={4} height={15} rx={1.4} fill={color} />
    </Svg>
  );
}

/** Jump-back-10 and jump-forward-10, drawn as a circular arrow around the numeral. */
export function ReplayIcon({ size = 24, color = colors.text, seconds = 10 }: IconProps & { seconds?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5a7 7 0 1 1-6.7 9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="M12 2.2 12 7.8 7.6 5z" fill={color} />
      <Text x={12} y={15.6} value={String(seconds)} color={color} />
    </Svg>
  );
}

export function ForwardIcon({ size = 24, color = colors.text, seconds = 10 }: IconProps & { seconds?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5a7 7 0 1 0 6.7 9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="M12 2.2 12 7.8 16.4 5z" fill={color} />
      <Text x={12} y={15.6} value={String(seconds)} color={color} />
    </Svg>
  );
}

/** The numeral inside the two skip glyphs. */
function Text({ x, y, value, color }: { x: number; y: number; value: string; color: string }) {
  return (
    <SvgText x={x} y={y} fill={color} fontSize={8} fontWeight="700" textAnchor="middle">
      {value}
    </SvgText>
  );
}


/** The favourite control in its active state — a filled heart reads instantly. */
export function HeartFilledIcon({ size = 24, color = colors.progress }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"
        fill={color}
      />
    </Svg>
  );
}

/** Repeat-one: the repeat loop with a numeral in the middle. */
export function RepeatOneIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 3 3 6l3 3M18 21l3-3-3-3M3 6h12a5 5 0 0 1 5 5M21 18H9a5 5 0 0 1-5-5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgText x={12} y={15} fill={color} fontSize={9} fontWeight="700" textAnchor="middle">
        1
      </SvgText>
    </Svg>
  );
}
