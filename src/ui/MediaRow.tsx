import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MediaSummary, PlaybackProgress } from '../types';
import { ChevronRightIcon } from './Icons';
import { ASPECT, MediaCard, shapeFor, type CardShape } from './MediaCard';
import { colors, space, type as typography } from './theme';

interface Props {
  title: string;
  items: readonly MediaSummary[];
  onOpen(item: MediaSummary): void;
  shape?: CardShape;
  progress?: Map<string, PlaybackProgress>;
  onRemove?(item: MediaSummary): void;
  onSeeAll?(): void;
  /** Rendered instead of the rail when there is nothing in it. */
  emptyLabel?: string;
}

/**
 * Horizontally scrolling rail. Cards are sized so a partial card shows at the
 * edge as the scroll affordance.
 */
export function MediaRow({ title, items, onOpen, shape, progress, onRemove, onSeeAll, emptyLabel }: Props) {
  const { width: viewport } = useWindowDimensions();
  const cardShape = shape ?? (items.length > 0 ? shapeFor(items[0].kind) : 'poster');
  const cardWidth = railCardWidth(viewport, cardShape);

  if (items.length === 0 && !emptyLabel) return null;

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole={onSeeAll ? 'button' : 'header'}
        disabled={!onSeeAll}
        onPress={onSeeAll}
        style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll ? <ChevronRightIcon size={18} color={colors.textFaint} /> : null}
      </Pressable>
      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <FlatList
          horizontal
          data={items as MediaSummary[]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          // Card plus gutter is one snap unit, so flicks settle on whole cards.
          snapToInterval={cardWidth + space.md}
          decelerationRate="fast"
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              width={cardWidth}
              shape={cardShape}
              onPress={onOpen}
              progress={progress?.get(item.id)}
              onRemove={onRemove}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
        />
      )}
    </View>
  );
}

function railCardWidth(viewport: number, shape: CardShape): number {
  const available = viewport - space.lg * 2;
  // Cards visible per screen width, by shape.
  const perScreen = shape === 'still' ? 1.35 : ASPECT[shape] === 1 ? 2.4 : 2.6;
  return Math.round(Math.min(available / perScreen, shape === 'still' ? 320 : 190));
}

const styles = StyleSheet.create({
  section: {
    marginBottom: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  rail: {
    paddingHorizontal: space.lg,
  },
  empty: {
    ...typography.caption,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
  },
});
