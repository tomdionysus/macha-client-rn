import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { newestCatalogueFirst } from '../../api/media';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import { usePlayback } from '../../providers/PlaybackProvider';
import { orderByIds } from '../../state/musicLibrary';
import type { MediaSummary } from '../../types';
import { AddToPlaylistSheet } from '../../ui/AddToPlaylistSheet';
import { DownloadButton } from '../../ui/DownloadButton';
import { Artwork } from '../../ui/Artwork';
import { ChevronRightIcon, HeartFilledIcon, HeartIcon, PlusIcon, ShuffleIcon } from '../../ui/Icons';
import { Library } from '../../ui/Library';
import { Screen } from '../../ui/Screen';
import { EmptyState, ErrorState, Loading } from '../../ui/Status';
import { Button, Segmented } from '../../ui/controls';
import { pluralize } from '../../ui/format';
import { useOpenMedia } from '../../ui/navigation';
import { useBottomChromeInset } from '../../ui/chrome';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../../ui/theme';

type MusicView = 'albums' | 'artists' | 'tracks' | 'playlists';
/** The library-depth cuts. All of these except "added" are local listening state. */
type TrackFilter = 'all' | 'favourites' | 'recent' | 'most' | 'added';

const FILTERS: Array<{ value: TrackFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'recent', label: 'Recently played' },
  { value: 'most', label: 'Most played' },
  { value: 'added', label: 'Recently added' },
];

export default function MusicScreen() {
  const { media, generation, playlists, musicLibrary } = useMacha();
  const openMedia = useOpenMedia();
  const router = useRouter();
  const { start, setShuffle, busy } = usePlayback();
  const bottomInset = useBottomChromeInset();

  const [view, setView] = useState<MusicView>('albums');
  const [filter, setFilter] = useState<TrackFilter>('all');
  const [adding, setAdding] = useState<MediaSummary[] | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const library = useAsync(
    (signal) =>
      view === 'artists'
        ? media.artists(signal)
        : view === 'tracks'
          ? media.tracks(signal)
          : view === 'albums'
            ? media.albums(signal)
            : Promise.resolve([] as MediaSummary[]),
    [media, generation, view],
  );

  const tracks = useMemo(() => {
    const all = library.value ?? [];
    if (view !== 'tracks') return [];
    switch (filter) {
      case 'favourites': {
        const favourites = new Set(musicLibrary.favourites());
        return all.filter((track) => favourites.has(track.id));
      }
      case 'recent':
        return orderByIds(all, musicLibrary.recentIds());
      case 'most':
        return orderByIds(all, musicLibrary.mostPlayedIds());
      case 'added':
        return newestCatalogueFirst(all);
      default:
        return all;
    }
  }, [library.value, view, filter, musicLibrary, nonce]);

  const playTracks = useCallback(
    (items: readonly MediaSummary[], index: number, shuffled = false) => {
      if (items.length === 0) return;
      setShuffle(shuffled);
      void start(items, index);
      router.navigate('/play');
    },
    [router, setShuffle, start],
  );

  const playlistList = useMemo(() => playlists.list(), [playlists, nonce, view]);

  const segments = (
    <View style={{ marginBottom: space.lg }}>
      <Segmented<MusicView>
        value={view}
        onChange={setView}
        options={[
          { value: 'albums', label: 'Albums' },
          { value: 'artists', label: 'Artists' },
          { value: 'tracks', label: 'Tracks' },
          { value: 'playlists', label: 'Lists' },
        ]}
      />
    </View>
  );

  const filterChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {FILTERS.map((entry) => (
        <Pressable
          key={entry.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: filter === entry.value }}
          onPress={() => setFilter(entry.value)}
          style={[styles.chip, filter === entry.value && styles.chipActive]}>
          <Text style={[styles.chipLabel, filter === entry.value && styles.chipLabelActive]}>{entry.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  // A full library is hundreds of tracks, so the track view owns its own
  // virtualized scroller rather than sitting inside the screen's ScrollView.
  // Rendering them all at once fired an image request per row and left most
  // of the artwork blank.
  if (view === 'tracks') {
    return (
      <Screen title="Music" scrollable={false}>
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {segments}
              {filterChips}
              {tracks.length > 0 ? (
                <View style={styles.trackActions}>
                  <Button
                    label={`Shuffle ${pluralize(tracks.length, 'track')}`}
                    variant="secondary"
                    icon={<ShuffleIcon size={18} color={colors.text} />}
                    disabled={busy}
                    onPress={() => playTracks(tracks, Math.floor(Math.random() * tracks.length), true)}
                  />
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            library.loading && !library.value ? (
              <Loading />
            ) : library.error && !library.value ? (
              <ErrorState error={library.error} onRetry={library.refresh} />
            ) : (
              <EmptyState
                title={filter === 'all' ? 'No tracks yet' : 'Nothing in this list yet'}
                detail={filter === 'favourites' ? 'Tap the heart on a track while it plays.' : undefined}
              />
            )
          }
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              favourite={musicLibrary.isFavourite(item.id)}
              playCount={musicLibrary.playCount(item.id)}
              onPlay={() => playTracks(tracks, index, false)}
              onAdd={() => setAdding([item])}
              onToggleFavourite={() => {
                musicLibrary.toggleFavourite(item.id);
                setNonce((value) => value + 1);
              }}
            />
          )}
        />
        <AddToPlaylistSheet visible={adding !== undefined} items={adding ?? []} onClose={() => setAdding(undefined)} />
      </Screen>
    );
  }

  return (
    <Screen title="Music" onRefresh={library.refresh} refreshing={library.refreshing}>
      {segments}

      {view === 'playlists' ? (
        <PlaylistList
          playlists={playlistList}
          onOpen={(id) => router.navigate(`/music/playlists/${encodeURIComponent(id)}` as never)}
          onCreate={() => {
            playlists.create('New playlist');
            setNonce((value) => value + 1);
          }}
        />
      ) : library.loading && !library.value ? (
        <Loading />
      ) : library.error && !library.value ? (
        <ErrorState error={library.error} onRetry={library.refresh} />
      ) : (
        <Library items={library.value ?? []} onOpen={openMedia} noun={view} shape="square" />
      )}

      <AddToPlaylistSheet visible={adding !== undefined} items={adding ?? []} onClose={() => setAdding(undefined)} />
    </Screen>
  );
}

function PlaylistList({
  playlists,
  onOpen,
  onCreate,
}: {
  playlists: Array<{ id: string; name: string; items: MediaSummary[] }>;
  onOpen(id: string): void;
  onCreate(): void;
}) {
  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <Button label="New playlist" icon={<PlusIcon size={18} color={colors.text} />} onPress={onCreate} />
      {playlists.length === 0 ? (
        <EmptyState title="No playlists yet" detail="Create one, then add tracks from any album." />
      ) : (
        <View style={{ marginTop: space.lg }}>
          {playlists.map((playlist) => (
            <Pressable
              key={playlist.id}
              accessibilityRole="button"
              accessibilityLabel={playlist.name}
              onPress={() => onOpen(playlist.id)}
              style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}>
              <Artwork
                artwork={playlist.items[0]?.artwork?.poster ?? playlist.items[0]?.musicContext?.artwork}
                fallbackText={playlist.name}
                style={styles.playlistArt}
                borderRadius={radius.sm}
              />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.playlistName}>
                  {playlist.name}
                </Text>
                <Text style={styles.playlistCount}>{pluralize(playlist.items.length, 'track')}</Text>
              </View>
              <ChevronRightIcon size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function TrackRow({
  track,
  favourite,
  playCount,
  onPlay,
  onAdd,
  onToggleFavourite,
}: {
  track: MediaSummary;
  favourite: boolean;
  playCount: number;
  onPlay(): void;
  onAdd(): void;
  onToggleFavourite(): void;
}) {
  return (
    <View style={styles.trackRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Play ${track.title}`} onPress={onPlay} style={styles.trackMain}>
        <Artwork
          artwork={track.artwork?.poster ?? track.musicContext?.artwork}
          fallbackText={track.title}
          style={styles.trackArt}
          borderRadius={radius.sm}
        />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.trackTitle}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={styles.trackSubtitle}>
            {[track.musicContext?.artist?.title, track.musicContext?.album.title].filter(Boolean).join(' · ')}
            {playCount > 0 ? `  ·  ${playCount} play${playCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
        hitSlop={6}
        onPress={onToggleFavourite}
        style={styles.trackButton}>
        {favourite ? <HeartFilledIcon size={18} /> : <HeartIcon size={18} color={colors.textFaint} />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${track.title} to a playlist`}
        hitSlop={6}
        onPress={onAdd}
        style={styles.trackButton}>
        <PlusIcon size={18} color={colors.textDim} />
      </Pressable>
      <DownloadButton item={track} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingBottom: space.lg,
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentSurfaceStrong,
    borderColor: colors.accentEdge,
  },
  chipLabel: {
    ...typography.caption,
    color: colors.textFaint,
  },
  chipLabelActive: {
    color: colors.text,
  },
  trackActions: {
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  trackMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET,
  },
  trackArt: {
    width: 40,
    height: 40,
  },
  trackTitle: {
    ...typography.body,
    color: colors.text,
  },
  trackSubtitle: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 1,
  },
  trackButton: {
    width: 34,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET + 8,
  },
  pressed: {
    opacity: 0.7,
  },
  playlistArt: {
    width: 46,
    height: 46,
  },
  playlistName: {
    ...typography.body,
    color: colors.text,
  },
  playlistCount: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 1,
  },
});
