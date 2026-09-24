import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import { usePlayback } from '../../providers/PlaybackProvider';
import type { Episode, SeasonDetails } from '../../types';
import { Artwork } from '../../ui/Artwork';
import { DetailHero } from '../../ui/DetailHero';
import { PlayIcon } from '../../ui/Icons';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';
import { Button } from '../../ui/controls';
import { pluralize } from '../../ui/format';
import { colors, radius, space, type as typography } from '../../ui/theme';
import { episodeCode } from '../../ui/labels';

export default function SeasonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation, continueWatching } = useMacha();
  const { start, busy } = usePlayback();
  const router = useRouter();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);

  const season = detail.value as SeasonDetails | undefined;
  const episodes = season?.episodes ?? [];

  // The whole season is the queue. Playing any episode continues into the next
  // one without the viewer going back to this screen.
  const playFrom = useCallback(
    (index: number) => {
      void start(episodes, index);
      router.navigate('/play');
    },
    [episodes, router, start],
  );

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!season && detail.loading ? <Loading /> : null}
      {!season && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {season ? (
        <>
          <DetailHero
            item={season}
            facts={[
              season.year ? String(season.year) : undefined,
              episodes.length > 0 ? pluralize(episodes.length, 'episode') : undefined,
            ]}
            actions={
              episodes.length > 0 ? (
                <Button
                  label="Play season"
                  icon={<PlayIcon size={18} color={colors.text} />}
                  onPress={() => playFrom(0)}
                  busy={busy}
                />
              ) : undefined
            }
          />

          <View style={styles.list}>
            {episodes.map((episode, index) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                positionMs={continueWatching.positionFor(episode.id)}
                onPlay={() => playFrom(index)}
                onOpen={() => router.navigate(`/episodes/${encodeURIComponent(episode.id)}` as never)}
              />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One episode. The still is the play target — the biggest, most obvious thing
 * on the row does the thing the viewer came for — while the text opens the
 * episode page for the synopsis and technical detail.
 */
function EpisodeRow({
  episode,
  positionMs,
  onPlay,
  onOpen,
}: {
  episode: Episode;
  positionMs: number;
  onPlay(): void;
  onOpen(): void;
}) {
  const fraction = positionMs > 0 && episode.durationMs ? Math.min(1, positionMs / episode.durationMs) : 0;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${episode.title}`}
        onPress={onPlay}
        style={({ pressed }) => [styles.still, pressed && styles.pressed]}>
        <Artwork
          artwork={episode.artwork?.thumbnail ?? episode.artwork?.backdrop}
          fallbackText={episode.title}
          style={StyleSheet.absoluteFill}
          borderRadius={radius.sm}
        />
        <View style={styles.playOverlay}>
          <PlayIcon size={18} color={colors.text} />
        </View>
        {fraction > 0 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`About ${episode.title}`}
        onPress={onOpen}
        style={styles.rowText}>
        <Text style={styles.episodeNumber}>{episodeCode(episode) ?? `Episode ${episode.episodeNumber}`}</Text>
        <Text numberOfLines={2} style={styles.episodeTitle}>
          {episode.title}
        </Text>
        {episode.synopsis ? (
          <Text numberOfLines={3} style={styles.synopsis}>
            {episode.synopsis}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: space.xxl,
    gap: space.xl,
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  still: {
    width: 132,
    height: 74,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  pressed: {
    opacity: 0.7,
  },
  playOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    paddingLeft: 2,
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
  rowText: {
    flex: 1,
  },
  episodeNumber: {
    ...typography.micro,
    color: colors.textFaint,
  },
  episodeTitle: {
    ...typography.label,
    color: colors.text,
    marginTop: 2,
  },
  synopsis: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: space.xs,
    lineHeight: 17,
  },
});
