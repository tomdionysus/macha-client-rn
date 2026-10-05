import { useMemo } from 'react';
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
 * Library grid with columns sized to the viewport, so cards keep roughly the
 * same physical size. A plain wrapping view, not a virtualized list, because
 * callers already scroll it and nested lists break scroll handoff.
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
