import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { MediaSummary } from '../types';
import { MediaGrid } from './MediaGrid';
import { SearchIcon } from './Icons';
import { colors, radius, space, type as typography } from './theme';
import { pluralize } from './format';
import { EmptyState } from './Status';
import type { CardShape } from './MediaCard';

interface Props {
  items: readonly MediaSummary[];
  onOpen(item: MediaSummary): void;
  noun: string;
  shape?: CardShape;
}

/**
 * A whole library section, with a local filter.
 *
 * The filter is client-side on purpose: the list is already in memory, so
 * narrowing it should be instant and work with no node round trip. Catalogue
 * search — which looks beyond the current section — is a separate screen.
 */
export function Library({ items, onOpen, noun, shape }: Props) {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title));
    if (!needle) return sorted;
    return sorted.filter((item) => item.title.toLowerCase().includes(needle));
  }, [items, filter]);

  return (
    <View>
      <View style={styles.filterBar}>
        <SearchIcon size={17} color={colors.textFaint} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder={`Filter ${noun}`}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={styles.filterInput}
        />
        <Text style={styles.count}>{visible.length}</Text>
      </View>
      {visible.length === 0 ? (
        <EmptyState
          title={filter ? `No ${noun} match “${filter.trim()}”` : `No ${noun} yet`}
          detail={filter ? undefined : 'Items appear here as the node indexes your library.'}
        />
      ) : (
        <>
          <MediaGrid items={visible} onOpen={onOpen} shape={shape} />
          <Text style={styles.total}>{pluralize(visible.length, noun.replace(/s$/, ''))}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
  count: {
    ...typography.caption,
    color: colors.textFaint,
    minWidth: 22,
    textAlign: 'right',
  },
  total: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: space.xl,
  },
});
