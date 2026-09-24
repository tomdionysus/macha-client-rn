import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SEARCH_CATEGORIES,
  DEFAULT_SEARCH_SORT,
  isSearchable,
  orderMedia,
  SEARCH_CATEGORIES,
  SEARCH_SORTS,
  type MediaSortKey,
  type SearchCategoryKey,
} from '@machafoundation/core';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

/**
 * The line for a query that found nothing — including one made only of words
 * that are never searched on, or with every category off. Tom's wording, the
 * same on every client.
 */
const NOTHING_FOUND = 'Nothing found. Try different search terms or filters.';

export default function SearchScreen() {
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<MediaSortKey>(DEFAULT_SEARCH_SORT);
  const [categories, setCategories] = useState<readonly SearchCategoryKey[]>(DEFAULT_SEARCH_CATEGORIES);
  const toggleCategory = (key: SearchCategoryKey) =>
    setCategories((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Core's rules decide whether a query is worth sending: "the", "a" and "an"
  // are never searched on, and two characters must be left. Nothing is sent
  // for a query that fails them, or with every category off.
  const searchable = isSearchable(debounced) && categories.length > 0;
  const results = useAsync<MediaSummary[]>(
    async (signal) => (searchable ? media.search(debounced, signal, categories) : []),
    [media, generation, debounced, searchable, categories],
  );

  const idle = debounced.length === 0;
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
      <View style={styles.controls}>
        {SEARCH_CATEGORIES.map((category) => {
          const on = categories.includes(category.key);
          return (
            <Pressable
              key={category.key}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              onPress={() => toggleCategory(category.key)}
              style={[styles.toggle, on && styles.toggleOn]}>
              <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>{category.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <SortControl sorts={SEARCH_SORTS} value={sort} onChange={setSort} />

      {idle ? (
        <EmptyState title="Search your catalogue" detail="Everything here comes from your own nodes." />
      ) : !searchable ? (
        <EmptyState title={NOTHING_FOUND} />
      ) : results.loading && !results.value ? (
        <Loading />
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={results.refresh} />
      ) : results.value && results.value.length === 0 ? (
        <EmptyState title={NOTHING_FOUND} />
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
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  toggle: {
    paddingHorizontal: space.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toggleOn: {
    backgroundColor: colors.accentSurfaceStrong,
    borderColor: colors.borderStrong,
  },
  toggleLabel: {
    ...typography.label,
    color: colors.textDim,
  },
  toggleLabelOn: {
    color: colors.text,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
});
