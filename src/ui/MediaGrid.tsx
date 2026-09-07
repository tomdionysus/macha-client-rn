import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MediaSummary } from '../types';
import { MediaCard, shapeFor, type CardShape } from './MediaCard';
import { space } from './theme';

interface Props {
  items: readonly MediaSummary[];
  onOpen(item: MediaSummary): void;
  shape?: CardShape;
}

/**
 * The library grid. Column count follows the viewport rather than being fixed,
 * so a small phone, a large phone and a phone in landscape each get cards of
 * roughly the same physical size instead of the same *number* of cards.
 *
 * It renders as a plain wrapping view because every caller already puts it
 * inside one scroll container; nesting a second virtualized list inside that
 * would break scroll handoff for a payload this size.
 */
export function MediaGrid({ items, onOpen, shape }: Props) {
  const { width: viewport } = useWindowDimensions();
  const cardShape = shape ?? (items.length > 0 ? shapeFor(items[0].kind) : 'poster');

  const { columns, cardWidth } = useMemo(() => {
    const available = viewport - space.lg * 2;
    const target = cardShape === 'still' ? 260 : 150;
    const count = Math.max(2, Math.round(available / target));
    return { columns: count, cardWidth: Math.floor((available - space.md * (count - 1)) / count) };
  }, [viewport, cardShape]);

  return (
    <View style={styles.grid}>
      {items.map((item, index) => (
        <MediaCard
          key={item.id}
          item={item}
          width={cardWidth}
          shape={cardShape}
          onPress={onOpen}
          style={{ marginRight: (index + 1) % columns === 0 ? 0 : space.md }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.lg,
    rowGap: space.lg,
  },
});
