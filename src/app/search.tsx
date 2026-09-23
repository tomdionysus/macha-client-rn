import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SEARCH_SORT, orderMedia, SEARCH_SORTS, type MediaSortKey } from '@machafoundation/core';
import { StyleSheet, TextInput, View } from 'react-native';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { SearchIcon } from '../ui/Icons';
import { MediaGrid } from '../ui/MediaGrid';
import { SortControl } from '../ui/SortControl';
import { Screen } from '../ui/Screen';
import { EmptyState, ErrorState, Loading } from '../ui/Status';
import { colors, radius, space, type as typography } from '../ui/theme';
import { useOpenMedia } from '../ui/navigation';
import type { MediaSummary } from '../types';

/** Long enough to stop typing mid-word triggering a query; short enough to feel live. */
const DEBOUNCE_MS = 280;
const MINIMUM_QUERY_LENGTH = 2;

export default function SearchScreen() {
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<MediaSortKey>(DEFAULT_SEARCH_SORT);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useAsync<MediaSummary[]>(
    async (signal) => (debounced.length >= MINIMUM_QUERY_LENGTH ? media.search(debounced, signal) : []),
    [media, generation, debounced],
  );

  const idle = debounced.length < MINIMUM_QUERY_LENGTH;
  // Relevance is the node's own order; the others are core's, the same four
  // choices every client offers.
  const ordered = useMemo(() => (results.value ? orderMedia(results.value, sort, SEARCH_SORTS) : undefined), [results.value, sort]);

  return (
    <Screen title="Search">
      <View style={styles.field}>
        <SearchIcon size={18} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Films, series, episodes, music"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.input}
        />
      </View>
      <SortControl sorts={SEARCH_SORTS} value={sort} onChange={setSort} />

      {idle ? (
        <EmptyState title="Search your catalogue" detail="Everything here comes from your own nodes." />
      ) : results.loading && !results.value ? (
        <Loading />
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={results.refresh} />
      ) : results.value && results.value.length === 0 ? (
        <EmptyState title={`Nothing matches “${debounced}”`} />
      ) : ordered ? (
        <MediaGrid items={ordered} onOpen={openMedia} shape="poster" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.xl,
    paddingHorizontal: space.md,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
});
