import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MediaSummary, PlaybackProgress } from '../types';
import { Artwork } from './Artwork';
import { CloseIcon, PlayIcon } from './Icons';
import { colors, radius, space, type as typography } from './theme';

/**
 * Poster (2:3) for films and series, still (16:9) for episodes, sleeve (1:1)
 * for music. Aspect ratio is a property of the *content*, so it is derived
 * here rather than passed down by every caller.
 */
export type CardShape = 'poster' | 'still' | 'square';

export function shapeFor(kind: MediaSummary['kind']): CardShape {
  if (kind === 'episode') return 'still';
  if (kind === 'album' || kind === 'artist' || kind === 'track') return 'square';
  return 'poster';
}

export const ASPECT: Record<CardShape, number> = {
  poster: 2 / 3,
  still: 16 / 9,
  square: 1,
};

interface Props {
  item: MediaSummary;
  width: number;
  onPress(item: MediaSummary): void;
  shape?: CardShape;
  /** Draws a resume bar under the artwork and a play badge over it. */
  progress?: PlaybackProgress;
  onRemove?(item: MediaSummary): void;
  style?: StyleProp<ViewStyle>;
}

export function MediaCard({ item, width, onPress, shape, progress, onRemove, style }: Props) {
  const cardShape = shape ?? shapeFor(item.kind);
  const height = width / ASPECT[cardShape];
  const artwork =
    cardShape === 'still'
      ? (item.artwork?.thumbnail ?? item.artwork?.backdrop ?? item.artwork?.poster)
      : (item.artwork?.poster ?? item.artwork?.thumbnail ?? item.artwork?.backdrop);

  const fraction = progress && progress.durationMs > 0 ? Math.min(1, progress.positionMs / progress.durationMs) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onPress(item)}
      style={({ pressed }) => [{ width }, style, pressed && styles.pressed]}>
      <View style={[styles.artworkFrame, { width, height }]}>
        <Artwork artwork={artwork} fallbackText={item.title} style={StyleSheet.absoluteFill} />
        {progress ? (
          <>
            <View style={styles.playBadge}>
              <PlayIcon size={18} color={colors.text} />
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
            </View>
          </>
        ) : null}
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.title} from Continue Watching`}
            hitSlop={10}
            onPress={() => onRemove(item)}
            style={styles.removeButton}>
            <CloseIcon size={14} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.title}>
        {item.title}
      </Text>
      {cardSubtitle(item) ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {cardSubtitle(item)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function cardSubtitle(item: MediaSummary): string | undefined {
  if (item.kind === 'episode') {
    const context = item.playbackContext?.series.title;
    return [item.subtitle, context].filter(Boolean).join(' · ') || undefined;
  }
  if (item.year) return String(item.year);
  return item.subtitle;
}

const styles = StyleSheet.create({
  artworkFrame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  pressed: {
    opacity: 0.72,
  },
  title: {
    ...typography.label,
    color: colors.text,
    marginTop: space.sm,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  playBadge: {
    position: 'absolute',
    left: space.sm,
    bottom: space.md,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
    backgroundColor: colors.accentSurfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  removeButton: {
    position: 'absolute',
    right: space.xs,
    top: space.xs,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.track,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.progress,
  },
});
