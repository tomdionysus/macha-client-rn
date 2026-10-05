import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_LIBRARY_SORT, LIBRARY_SORTS, orderMedia, type MediaSortKey } from '@machafoundation/core';
import type { MediaSummary } from '../types';
import { MediaGrid } from './MediaGrid';
import { SearchIcon } from './Icons';
import { colors, radius, space, type as typography } from './theme';
import { pluralize } from './format';
import { EmptyState } from './Status';
import { SortControl } from './SortControl';
import { useProblems } from '../providers/MachaProvider';
import { describeEmptyLibrary } from '../state/problems';
import type { CardShape } from './MediaCard';

interface Props {
  items: readonly MediaSummary[];
  onOpen(item: MediaSummary): void;
  noun: string;
  shape?: CardShape;
}

/** A whole library section with an in-memory title filter; catalogue search is a separate screen. */
export function Library({ items, onOpen, noun, shape }: Props) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<MediaSortKey>(DEFAULT_LIBRARY_SORT);
  const problems = useProblems();

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    // Core's orders; title ignores leading articles, so "The Matrix" files under M.
    const sorted = orderMedia(items, sort, LIBRARY_SORTS);
    if (!needle) return sorted;
    return sorted.filter((item) => item.title.toLowerCase().includes(needle));
  }, [items, filter, sort]);

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
      <SortControl sorts={LIBRARY_SORTS} value={sort} onChange={setSort} />
      {visible.length === 0 ? (
        // An empty unfiltered library is explained from the cluster's problems.
        filter ? (
          <EmptyState title={`No ${noun} match “${filter.trim()}”`} />
        ) : (
          <EmptyState {...describeEmptyLibrary(noun, problems)} />
        )
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
