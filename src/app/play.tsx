import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '../providers/PlaybackProvider';
import { Artwork } from '../ui/Artwork';
import {
  ChevronDownIcon,
  ForwardIcon,
  LayersIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from '../ui/Icons';
import { NowPlayingMusic } from '../ui/NowPlayingMusic';
import { PlaybackOptionsSheet } from '../ui/PlaybackOptionsSheet';
import { SeekBar } from '../ui/SeekBar';
import { Button } from '../ui/controls';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../ui/theme';

/** Chrome fades out this long after the last touch, but only while playback is actually running. */
const CONTROLS_HIDE_DELAY_MS = 3_500;

/**
 * A transport control that changes playback gets a light tap. Full-screen video
 * hides the usual visual feedback of a button press, so touch is doing the work
 * the chrome cannot.
 */
function tap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
const SKIP_MS = 10_000;
/** Two taps closer together than this on the same side count as a skip gesture. */
const DOUBLE_TAP_MS = 280;

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    player,
    media,
    session,
    status,
    playing,
    buffering,
    positionMs,
    durationMs,
    bufferedMs,
    error,
    queue,
    queueIndex,
    busy,
    toggle,
    seekTo,
    seekBy,
    skipNext,
    skipPrevious,
    stop,
    retry,
  } = usePlayback();

  const [chromeVisible, setChromeVisible] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef<{ at: number; side: 'left' | 'right' } | undefined>(undefined);

  const audioOnly = media?.kind === 'track';
  useKeepAwake();

  // Video is worth rotating for; audio is not. Portrait is restored on the way
  // out so the rest of the app keeps its fixed orientation.
  useEffect(() => {
    if (audioOnly) return;
    void ScreenOrientation.unlockAsync();
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [audioOnly]);

  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    armHide();
  }, [armHide]);

  // Paused, buffering, failed or audio-only playback keeps its controls: there
  // is nothing to reveal by hiding them, and a stalled screen with no chrome
  // looks broken.
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing && !optionsOpen && !audioOnly && status === 'ready') armHide();
    else setChromeVisible(true);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [playing, optionsOpen, audioOnly, status, armHide]);

  const onSurfaceTap = useCallback(
    (side: 'left' | 'right') => {
      const now = Date.now();
      const previous = lastTap.current;
      if (previous && previous.side === side && now - previous.at < DOUBLE_TAP_MS) {
        lastTap.current = undefined;
        tap();
        seekBy(side === 'left' ? -SKIP_MS : SKIP_MS);
        showChrome();
        return;
      }
      lastTap.current = { at: now, side };
      if (chromeVisible) setChromeVisible(false);
      else showChrome();
    },
    [chromeVisible, seekBy, showChrome],
  );

  const leave = useCallback(() => {
    // Leaving the full player does not end playback: the docked mini player is
    // another view of the same owned session.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const endAndLeave = useCallback(() => {
    void stop();
    leave();
  }, [leave, stop]);

  if (!media) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.emptyText}>Nothing is playing.</Text>
        <Button label="Back to library" variant="secondary" onPress={leave} />
      </View>
    );
  }

  // Music gets its own presentation entirely: controls that stay put, artwork
  // as the subject, shuffle/repeat/queue. Sharing the video chrome made it a
  // video player with a picture in the middle.
  if (audioOnly) return <NowPlayingMusic onClose={leave} />;

  const landscape = width > height;
  const canSeek = session?.options.canSeek ?? true;

  return (
    <View style={styles.root}>
      {audioOnly ? (
        <View style={styles.audioStage}>
          <Artwork
            artwork={media.artwork?.poster ?? media.artwork?.thumbnail}
            fallbackText={media.title}
            style={{ width: Math.min(width - space.xxl * 2, 320), height: Math.min(width - space.xxl * 2, 320) }}
            borderRadius={radius.lg}
          />
        </View>
      ) : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={false}
        />
      )}

      {/* Two halves so a double tap can mean "back ten" or "forward ten"
          depending on which side of the picture it lands. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.tapRow}>
          <Pressable style={styles.tapHalf} onPress={() => onSurfaceTap('left')} />
          <Pressable style={styles.tapHalf} onPress={() => onSurfaceTap('right')} />
        </View>
      </View>

      {buffering && status !== 'failed' ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : null}

      {status === 'failed' ? (
        <View style={styles.failure}>
          <Text style={styles.failureTitle}>Playback failed</Text>
          <Text style={styles.failureDetail}>{error ?? 'The node could not serve this item.'}</Text>
          <View style={styles.failureActions}>
            <Button label="Try again" onPress={() => void retry()} busy={busy} />
            <Button label="Stop" variant="secondary" onPress={endAndLeave} />
          </View>
        </View>
      ) : null}

      {chromeVisible ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + space.sm, paddingHorizontal: insets.left + space.lg }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to library" hitSlop={8} onPress={leave} style={styles.iconButton}>
              <ChevronDownIcon size={24} color={colors.text} />
            </Pressable>
            <View style={styles.titles}>
              <Text numberOfLines={1} style={styles.title}>
                {media.title}
              </Text>
              {subtitleFor(media.playbackContext?.series.title, media.subtitle, session?.mode) ? (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {subtitleFor(media.playbackContext?.series.title, media.subtitle, session?.mode)}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Playback options"
              hitSlop={8}
              disabled={!session}
              onPress={() => setOptionsOpen(true)}
              style={[styles.iconButton, !session && styles.disabled]}>
              <LayersIcon size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.transport} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back ten seconds"
              onPress={() => {
                tap();
                seekBy(-SKIP_MS);
                showChrome();
              }}
              style={styles.transportButton}>
              <ReplayIcon size={34} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              onPress={() => {
                tap();
                toggle();
                showChrome();
              }}
              style={styles.playButton}>
              {playing ? <PauseIcon size={30} color={colors.text} /> : <PlayIcon size={30} color={colors.text} />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forward ten seconds"
              onPress={() => {
                tap();
                seekBy(SKIP_MS);
                showChrome();
              }}
              style={styles.transportButton}>
              <ForwardIcon size={34} color={colors.text} />
            </Pressable>
          </View>

          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: insets.bottom + (landscape ? space.md : space.xl),
                paddingHorizontal: insets.left + space.lg,
              },
            ]}>
            <SeekBar
              positionMs={positionMs}
              durationMs={durationMs}
              bufferedMs={bufferedMs}
              enabled={canSeek && !busy}
              onSeek={(target) => {
                tap();
                seekTo(target);
                showChrome();
              }}
            />
            <View style={styles.bottomRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous item"
                disabled={queueIndex <= 0 || busy}
                onPress={() => void skipPrevious()}
                style={[styles.iconButton, (queueIndex <= 0 || busy) && styles.disabled]}>
                <SkipBackIcon size={20} color={colors.text} />
              </Pressable>
              <Text style={styles.queuePosition}>
                {queue.length > 1 ? `${queueIndex + 1} of ${queue.length}` : session ? modeLabel(session.mode) : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next item"
                disabled={queueIndex >= queue.length - 1 || busy}
                onPress={() => void skipNext()}
                style={[styles.iconButton, (queueIndex >= queue.length - 1 || busy) && styles.disabled]}>
                <SkipForwardIcon size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      <PlaybackOptionsSheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </View>
  );
}

function modeLabel(mode: string): string {
  if (mode === 'direct') return 'Direct play';
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function subtitleFor(series: string | undefined, subtitle: string | undefined, mode: string | undefined): string {
  return [series, subtitle, mode ? modeLabel(mode) : undefined].filter(Boolean).join('  ·  ');
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textDim,
  },
  audioStage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tapRow: {
    flex: 1,
    flexDirection: 'row',
  },
  tapHalf: {
    flex: 1,
  },
  spinner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failure: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.xxl,
    backgroundColor: 'rgba(6,6,7,0.86)',
  },
  failureTitle: {
    ...typography.title,
    color: colors.text,
  },
  failureDetail: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  failureActions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.md,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.lg,
    backgroundColor: 'rgba(6,6,7,0.55)',
  },
  titles: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: 2,
  },
  transport: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
  },
  transportButton: {
    width: TOUCH_TARGET + 16,
    height: TOUCH_TARGET + 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 74,
    height: 74,
    paddingLeft: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentEdge,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    backgroundColor: 'rgba(6,6,7,0.55)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  queuePosition: {
    ...typography.caption,
    color: colors.textDim,
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
