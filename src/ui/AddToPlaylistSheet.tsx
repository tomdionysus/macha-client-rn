import { useState } from 'react';
import { MachaSavedRowLimitError } from '@machafoundation/core';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMacha } from '../providers/MachaProvider';
import { usePlaylists } from '../hooks/usePlaylists';
import type { MediaSummary } from '../types';
import { PlusIcon } from './Icons';
import { Sheet, SheetOption } from './Sheet';
import { Button } from './controls';
import { pluralize } from './format';
import { colors, radius, space, type as typography } from './theme';

interface Props {
  visible: boolean;
  /** The tracks to add: one track, or a whole album's worth. */
  items: readonly MediaSummary[];
  onClose(): void;
}

/** Adds tracks to an existing playlist, or to one created on the spot. */
export function AddToPlaylistSheet({ visible, items, onClose }: Props) {
  const { playlists } = useMacha();
  const [name, setName] = useState('');
  const existing = usePlaylists();

  const label = items.length === 1 ? items[0]?.title : pluralize(items.length, 'track');

  const addTo = (id: string, playlistName: string) => {
    const before = playlists.get(id)?.items.length ?? 0;
    let after: number;
    try {
      after = playlists.add(id, items)?.items.length ?? before;
    } catch (error) {
      if (!(error instanceof MachaSavedRowLimitError)) throw error;
      // The sheet stays open so the viewer can start another playlist from it.
      Alert.alert('Playlist full', `${playlistName} cannot hold any more tracks. Start a new playlist for these.`);
      return;
    }
    const added = after - before;
    onClose();
    // Report "already there" too; silence would read as a bug.
    Alert.alert(
      added > 0 ? 'Added' : 'Already there',
      added > 0
        ? `${pluralize(added, 'track')} added to ${playlistName}.`
        : `${label} is already in ${playlistName}.`,
    );
  };

  const createAndAdd = () => {
    let created;
    try {
      created = playlists.create(name, items);
    } catch (error) {
      if (!(error instanceof MachaSavedRowLimitError)) throw error;
      Alert.alert('Too many tracks', 'That is more than one playlist can hold. Add them in smaller groups.');
      return;
    }
    setName('');
    onClose();
    Alert.alert('Playlist created', `${created.name} · ${pluralize(created.items.length, 'track')}.`);
  };

  return (
    <Sheet visible={visible} title="Add to playlist" onClose={onClose}>
      <Text style={styles.subject} numberOfLines={1}>
        {label}
      </Text>

      <View style={styles.createRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New playlist name"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && createAndAdd()}
        />
        <Button
          label="Create"
          icon={<PlusIcon size={16} color={colors.text} />}
          disabled={!name.trim()}
          onPress={createAndAdd}
        />
      </View>

      {existing.length === 0 ? (
        <Text style={styles.empty}>No playlists yet.</Text>
      ) : (
        existing.map((playlist) => (
          <SheetOption
            key={playlist.id}
            label={playlist.name}
            detail={pluralize(playlist.items.length, 'track')}
            onPress={() => addTo(playlist.id, playlist.name)}
          />
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  subject: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xl,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.md,
    minHeight: 46,
  },
  empty: {
    ...typography.caption,
    color: colors.textFaint,
    marginBottom: space.md,
  },
});
