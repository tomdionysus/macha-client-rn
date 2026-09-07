import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMacha } from '../../../providers/MachaProvider';
import { usePlayback } from '../../../providers/PlaybackProvider';
import type { Playlist } from '../../../state/playlists';
import { Artwork } from '../../../ui/Artwork';
import { ChevronDownIcon, CloseIcon, PlayIcon, ShuffleIcon, TrashIcon } from '../../../ui/Icons';
import { Screen } from '../../../ui/Screen';
import { EmptyState } from '../../../ui/Status';
import { Button } from '../../../ui/controls';
import { pluralize } from '../../../ui/format';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../../../ui/theme';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playlists } = useMacha();
  const { start, setShuffle, media: nowPlaying, busy } = usePlayback();
  const router = useRouter();

  // Playlists are local, so re-reading the store is the whole refresh; a nonce
  // is cheaper and more predictable here than mirroring the list into state.
  const [nonce, setNonce] = useState(0);
  const playlist: Playlist | undefined = playlists.get(id);
  const touch = useCallback(() => setNonce((value) => value + 1), []);
  void nonce;

  const play = useCallback(
    (index: number, shuffled = false) => {
      if (!playlist || playlist.items.length === 0) return;
      setShuffle(shuffled);
      void start(playlist.items, index);
      router.navigate('/play');
    },
    [playlist, router, setShuffle, start],
  );

  const confirmDelete = useCallback(() => {
    if (!playlist) return;
    Alert.alert('Delete playlist', `Delete “${playlist.name}”? The tracks themselves are untouched.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          playlists.delete(playlist.id);
          router.back();
        },
      },
    ]);
  }, [playlist, playlists, router]);

  if (!playlist) {
    return (
      <Screen showBack title="Playlist">
        <EmptyState title="This playlist no longer exists" />
      </Screen>
    );
  }

  return (
    <Screen showBack title={playlist.name} eyebrow={pluralize(playlist.items.length, 'track')}>
      <View style={styles.actions}>
        <Button
          label="Play"
          icon={<PlayIcon size={18} color={colors.text} />}
          onPress={() => play(0, false)}
          disabled={playlist.items.length === 0 || busy}
        />
        <Button
          label="Shuffle"
          variant="secondary"
          icon={<ShuffleIcon size={18} color={colors.text} />}
          onPress={() => play(Math.floor(Math.random() * playlist.items.length), true)}
          disabled={playlist.items.length === 0 || busy}
        />
        <Button label="Delete" variant="quiet" icon={<TrashIcon size={18} color={colors.danger} />} onPress={confirmDelete} />
      </View>

      {playlist.items.length === 0 ? (
        <EmptyState title="Nothing here yet" detail="Add tracks from an album or the track list." />
      ) : (
        <View style={styles.list}>
          {playlist.items.map((item, index) => (
            <View key={`${item.id}-${index}`} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={() => play(index, false)}
                style={styles.main}>
                <Artwork
                  artwork={item.artwork?.poster ?? item.musicContext?.artwork}
                  fallbackText={item.title}
                  style={styles.art}
                  borderRadius={radius.sm}
                />
                <View style={styles.text}>
                  <Text numberOfLines={1} style={[styles.title, nowPlaying?.id === item.id && styles.playing]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {[item.musicContext?.artist?.title, item.musicContext?.album.title].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.title} up`}
                disabled={index === 0}
                hitSlop={6}
                onPress={() => {
                  playlists.move(playlist.id, index, index - 1);
                  touch();
                }}
                style={[styles.iconButton, index === 0 && styles.disabled]}>
                <View style={styles.flip}>
                  <ChevronDownIcon size={16} color={colors.textDim} />
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.title} down`}
                disabled={index === playlist.items.length - 1}
                hitSlop={6}
                onPress={() => {
                  playlists.move(playlist.id, index, index + 1);
                  touch();
                }}
                style={[styles.iconButton, index === playlist.items.length - 1 && styles.disabled]}>
                <ChevronDownIcon size={16} color={colors.textDim} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title}`}
                hitSlop={6}
                onPress={() => {
                  playlists.removeAt(playlist.id, index);
                  touch();
                }}
                style={styles.iconButton}>
                <CloseIcon size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.xl,
  },
  list: {
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET,
  },
  art: {
    width: 40,
    height: 40,
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.body,
    color: colors.text,
  },
  playing: {
    color: colors.progress,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 1,
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
