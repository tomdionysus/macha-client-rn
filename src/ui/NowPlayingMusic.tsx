import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback, type RepeatMode } from '../providers/PlaybackProvider';
import { Artwork } from './Artwork';
import {
  ChevronDownIcon,
  HeartFilledIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from './Icons';
import { QueueSheet } from './QueueSheet';
import { SeekBar } from './SeekBar';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

/**
 * The music presentation of the shared playback runtime.
 *
 * Video gets a picture and hiding chrome; music gets the opposite — the
 * controls are the screen, and nothing auto-hides. Same runtime underneath, so
 * moving between this, the video player and the mini player never touches the
 * session.
 */
export function NowPlayingMusic({ onClose }: { onClose(): void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { musicLibrary } = useMacha();
  const {
    media,
    playing,
    buffering,
    positionMs,
    durationMs,
    bufferedMs,
    busy,
    queue,
    queueIndex,
    shuffle,
    repeat,
    toggle,
    seekTo,
    skipNext,
    skipPrevious,
    setShuffle,
    setRepeat,
  } = usePlayback();

  const [queueOpen, setQueueOpen] = useState(false);
  const [favourite, setFavourite] = useState(() => (media ? musicLibrary.isFavourite(media.id) : false));

  if (!media) return null;

  const artSize = Math.min(width - space.xl * 2, 360);
  const artwork = media.artwork?.poster ?? media.artwork?.thumbnail ?? media.musicContext?.artwork;
  const artist = media.musicContext?.artist?.title;
  const album = media.musicContext?.album.title;
  const RepeatGlyph = repeat === 'one' ? RepeatOneIcon : RepeatIcon;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to library" hitSlop={8} onPress={onClose} style={styles.iconButton}>
          <ChevronDownIcon size={24} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.context}>
          {album ? album.toUpperCase() : 'NOW PLAYING'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show queue"
          hitSlop={8}
          onPress={() => setQueueOpen(true)}
          style={styles.iconButton}>
          <QueueIcon size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.stage}>
        <Artwork
          artwork={artwork}
          fallbackText={media.title}
          style={{ width: artSize, height: artSize }}
          borderRadius={radius.lg}
        />
      </View>

      <View style={styles.headings}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text numberOfLines={2} style={styles.title}>
              {media.title}
            </Text>
            {artist ? (
              <Text numberOfLines={1} style={styles.artist}>
                {artist}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            accessibilityState={{ selected: favourite }}
            hitSlop={8}
            onPress={() => setFavourite(musicLibrary.toggleFavourite(media.id))}
            style={styles.iconButton}>
            {favourite ? <HeartFilledIcon size={24} /> : <HeartIcon size={24} color={colors.textDim} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.seek}>
        <SeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          bufferedMs={bufferedMs}
          enabled={!busy}
          onSeek={seekTo}
        />
      </View>

      <View style={styles.transport}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shuffle ? 'Shuffle on' : 'Shuffle off'}
          accessibilityState={{ selected: shuffle }}
          hitSlop={8}
          onPress={() => setShuffle(!shuffle)}
          style={styles.iconButton}>
          <ShuffleIcon size={20} color={shuffle ? colors.progress : colors.textFaint} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous track"
          disabled={queueIndex <= 0 && !shuffle && repeat !== 'all'}
          hitSlop={8}
          onPress={() => void skipPrevious()}
          style={styles.iconButton}>
          <SkipBackIcon size={26} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={toggle}
          style={styles.playButton}>
          {buffering && !playing ? (
            <ActivityIndicator color={colors.text} />
          ) : playing ? (
            <PauseIcon size={30} color={colors.text} />
          ) : (
            <PlayIcon size={30} color={colors.text} />
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next track"
          disabled={queueIndex >= queue.length - 1 && repeat !== 'all'}
          hitSlop={8}
          onPress={() => void skipNext()}
          style={styles.iconButton}>
          <SkipForwardIcon size={26} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Repeat ${repeat}`}
          hitSlop={8}
          onPress={() => setRepeat(NEXT_REPEAT[repeat])}
          style={styles.iconButton}>
          <RepeatGlyph size={20} color={repeat === 'off' ? colors.textFaint : colors.progress} />
        </Pressable>
      </View>

      {queue.length > 1 ? (
        <Text style={styles.queuePosition}>
          {queueIndex + 1} of {queue.length}
          {shuffle ? ' · shuffled' : ''}
        </Text>
      ) : null}

      <QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: space.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  context: {
    ...typography.micro,
    color: colors.textFaint,
    flex: 1,
    textAlign: 'center',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
  },
  headings: {
    marginBottom: space.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  titleText: {
    flex: 1,
  },
  title: {
    ...typography.display,
    fontSize: 22,
    color: colors.text,
  },
  artist: {
    ...typography.body,
    color: colors.textDim,
    marginTop: space.xs,
  },
  seek: {
    marginBottom: space.sm,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  playButton: {
    width: 72,
    height: 72,
    paddingLeft: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentEdge,
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queuePosition: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: space.md,
  },
});
