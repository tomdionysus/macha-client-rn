import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AvailabilityBadge, heldBack } from '../../../ui/AvailabilityBadge';
import { useAsync } from '../../../hooks/useAsync';
import { useMacha } from '../../../providers/MachaProvider';
import { usePlayback } from '../../../providers/PlaybackProvider';
import type { AlbumDetails } from '../../../types';
import { DetailHero } from '../../../ui/DetailHero';
import { PlayIcon, PlusIcon, ShuffleIcon } from '../../../ui/Icons';
import { AddToPlaylistSheet } from '../../../ui/AddToPlaylistSheet';
import { DownloadButton } from '../../../ui/DownloadButton';
import { DownloadIcon } from '../../../ui/Icons';
import { Screen } from '../../../ui/Screen';
import { useToast } from '../../../ui/Toast';
import { ErrorState, Loading } from '../../../ui/Status';
import { Button, Divider, ListRow } from '../../../ui/controls';
import type { MediaSummary } from '../../../types';
import { pluralize } from '../../../ui/format';
import { colors, space, type as typography } from '../../../ui/theme';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation, downloadManager, downloads } = useMacha();
  const { start, setShuffle, busy, media: nowPlaying } = usePlayback();
  const [adding, setAdding] = useState<MediaSummary[] | undefined>(undefined);
  const router = useRouter();
  const toast = useToast();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);

  const album = detail.value as AlbumDetails | undefined;
  const tracks = album?.tracks ?? [];

  // Queue the whole album in order; picking a track starts there and continues.
  const playFrom = useCallback(
    (index: number, shuffled = false) => {
      setShuffle(shuffled);
      void start(tracks, index);
      router.navigate('/play');
    },
    [router, setShuffle, start, tracks],
  );

  /** The banner is the only feedback for queueing an album, so it reports what was actually added. */
  const downloadAlbum = useCallback(() => {
    const queued = downloadManager.enqueue(tracks);
    toast({
      icon: <DownloadIcon size={16} color={colors.progress} />,
      message:
        queued === 0
          ? 'Already downloaded'
          : `Downloading ${pluralize(queued, 'track')}`,
      action:
        queued === 0 ? undefined : { label: 'Downloads', onPress: () => router.navigate('/downloads') },
    });
  }, [downloadManager, router, toast, tracks]);

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!album && detail.loading ? <Loading /> : null}
      {!album && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {album ? (
        <>
          <DetailHero
            item={album}
            facts={[
              album.year ? String(album.year) : undefined,
              tracks.length > 0 ? pluralize(tracks.length, 'track') : undefined,
            ]}
            actions={
              tracks.length > 0 ? (
                <>
                  <Button
                    label="Play album"
                    icon={<PlayIcon size={18} color={colors.text} />}
                    onPress={() => playFrom(0)}
                    busy={busy}
                  />
                  <Button
                    label="Shuffle"
                    variant="secondary"
                    icon={<ShuffleIcon size={18} color={colors.text} />}
                    onPress={() => playFrom(Math.floor(Math.random() * tracks.length), true)}
                    disabled={busy}
                  />
                  <Button
                    label="Add"
                    variant="quiet"
                    icon={<PlusIcon size={18} color={colors.textDim} />}
                    onPress={() => setAdding(tracks)}
                  />
                  <Button
                    label="Download"
                    variant="quiet"
                    icon={<DownloadIcon size={18} color={colors.textDim} />}
                    onPress={downloadAlbum}
                  />
                </>
              ) : undefined
            }
          />

          <View style={{ marginTop: space.xxl }}>
            {tracks.map((track, index) => (
              <View key={track.id}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={track.title}
                  active={nowPlaying?.id === track.id}
                  onPress={() => playFrom(index)}
                  disabled={heldBack(track, downloads)}
                  leading={
                    <View style={styles.leading}>
                      <AvailabilityBadge item={track} size={14} inline />
                      <Text style={[styles.trackNumber, nowPlaying?.id === track.id && styles.trackNumberActive]}>
                        {track.trackNumber ?? index + 1}
                      </Text>
                    </View>
                  }
                  trailing={
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${track.title} to a playlist`}
                        hitSlop={8}
                        onPress={() => setAdding([track])}
                        style={styles.addButton}>
                        <PlusIcon size={18} color={colors.textFaint} />
                      </Pressable>
                      <DownloadButton item={track} compact />
                    </View>
                  }
                />
              </View>
            ))}
          </View>
        </>
      ) : null}
      <AddToPlaylistSheet visible={adding !== undefined} items={adding ?? []} onClose={() => setAdding(undefined)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackNumber: {
    ...typography.caption,
    color: colors.textFaint,
    width: 24,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  trackNumberActive: {
    color: colors.progress,
  },
  addButton: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
