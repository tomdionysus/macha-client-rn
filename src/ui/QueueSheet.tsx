import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayback } from '../providers/PlaybackProvider';
import { Artwork } from './Artwork';
import { ChevronDownIcon, CloseIcon, PlayIcon } from './Icons';
import { Sheet } from './Sheet';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

/**
 * The play queue, as a thing you can see and change.
 *
 * Reordering is by explicit move-up/move-down controls rather than drag. A
 * long-press drag inside a scrolling modal needs a gesture library and its own
 * pile of platform quirks; two buttons are unambiguous, reachable one-handed
 * and work with a screen reader.
 */
export function QueueSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { queue, queueIndex, playing, jumpTo, removeFromQueue, moveInQueue } = usePlayback();

  return (
    <Sheet visible={visible} title={`Queue · ${queue.length}`} onClose={onClose}>
      {queue.length === 0 ? (
        <Text style={styles.empty}>Nothing queued.</Text>
      ) : (
        queue.map((item, index) => {
          const current = index === queueIndex;
          return (
            <View key={`${item.id}-${index}`} style={[styles.row, current && styles.rowCurrent]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={() => void jumpTo(index)}
                style={styles.main}>
                <Artwork
                  artwork={item.artwork?.poster ?? item.artwork?.thumbnail ?? item.musicContext?.artwork}
                  fallbackText={item.title}
                  style={styles.art}
                  borderRadius={radius.sm}
                />
                <View style={styles.text}>
                  <Text numberOfLines={1} style={[styles.title, current && styles.titleCurrent]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {item.musicContext?.artist?.title ?? item.playbackContext?.series.title ?? item.subtitle ?? ''}
                  </Text>
                </View>
                {current ? (
                  <View style={styles.nowPlaying}>
                    {playing ? <Bars /> : <PlayIcon size={14} color={colors.progress} />}
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.title} up`}
                disabled={index === 0}
                hitSlop={6}
                onPress={() => moveInQueue(index, index - 1)}
                style={[styles.iconButton, index === 0 && styles.disabled]}>
                <View style={styles.flip}>
                  <ChevronDownIcon size={16} color={colors.textDim} />
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.title} down`}
                disabled={index === queue.length - 1}
                hitSlop={6}
                onPress={() => moveInQueue(index, index + 1)}
                style={[styles.iconButton, index === queue.length - 1 && styles.disabled]}>
                <ChevronDownIcon size={16} color={colors.textDim} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title} from the queue`}
                hitSlop={6}
                onPress={() => removeFromQueue(index)}
                style={styles.iconButton}>
                <CloseIcon size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

/** A static three-bar mark for the playing row — cheaper and calmer than an animation in a list. */
function Bars() {
  return (
    <View style={styles.bars}>
      <View style={[styles.bar, { height: 7 }]} />
      <View style={[styles.bar, { height: 12 }]} />
      <View style={[styles.bar, { height: 9 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...typography.caption,
    color: colors.textFaint,
    paddingVertical: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    marginBottom: space.xs,
    paddingRight: space.xs,
  },
  rowCurrent: {
    backgroundColor: colors.accentSurface,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingLeft: space.sm,
    minHeight: TOUCH_TARGET,
  },
  art: {
    width: 38,
    height: 38,
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.label,
    color: colors.text,
  },
  titleCurrent: {
    color: colors.progress,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 1,
  },
  nowPlaying: {
    width: 20,
    alignItems: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: colors.progress,
  },
  iconButton: {
    width: 30,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flip: {
    transform: [{ rotate: '180deg' }],
  },
  disabled: {
    opacity: 0.25,
  },
});
