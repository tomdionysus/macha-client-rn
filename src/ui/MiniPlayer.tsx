import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCurrentAvailability } from '../hooks/useCurrentAvailability';
import { usePlayback } from '../providers/PlaybackProvider';
import { Artwork } from './Artwork';
import { AvailabilityBadge } from './AvailabilityBadge';
import { CloseIcon, PauseIcon, PlayIcon } from './Icons';
import { MINI_PLAYER_HEIGHT } from './chrome';
import { Spinner } from './Status';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

/** Docked view of the current playback session; the same session as the full player. */
export function MiniPlayer() {
  const router = useRouter();
  const { status, media: playingMedia, playing, buffering, positionMs, durationMs, toggle, stop, error } = usePlayback();
  const media = useCurrentAvailability(playingMedia ? [playingMedia] : [])[0];

  if (status === 'idle' || !media) return null;

  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const artwork = media.artwork?.thumbnail ?? media.artwork?.poster ?? media.artwork?.backdrop;
  const subtitle = error ?? media.playbackContext?.series.title ?? media.musicContext?.artist?.title ?? '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Now playing: ${media.title}`}
      onPress={() => router.navigate('/play')}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      <View>
        <Artwork artwork={artwork} fallbackText={media.title} style={styles.artwork} borderRadius={radius.sm} />
        <AvailabilityBadge item={media} size={10} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.title}>
          {media.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, error ? styles.errorText : null]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        hitSlop={8}
        onPress={toggle}
        style={styles.control}>
        {buffering && !playing ? (
          <Spinner />
        ) : playing ? (
          <PauseIcon size={22} color={colors.text} />
        ) : (
          <PlayIcon size={22} color={colors.text} />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop playback"
        hitSlop={8}
        onPress={() => void stop()}
        style={styles.control}>
        <CloseIcon size={18} color={colors.textDim} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.track,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.progress,
  },
  artwork: {
    width: 42,
    height: 42,
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.label,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textFaint,
  },
  errorText: {
    color: colors.danger,
  },
  control: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
