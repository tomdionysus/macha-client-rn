import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MediaSummary } from '../types';
import { Artwork } from './Artwork';
import { colors, radius, space, type as typography } from './theme';

interface Props {
  item: MediaSummary;
  /** Short facts rendered under the title: year, runtime, episode count. */
  facts?: (string | undefined)[];
  /** Play controls and similar, laid out beneath the facts. */
  actions?: React.ReactNode;
}

/**
 * The top of every detail screen.
 *
 * A backdrop fills the width and fades into the page, with the poster inset
 * over it. Where there is no backdrop the poster carries the whole hero on its
 * own rather than leaving a grey slab — a home library has patchy artwork and
 * the layout has to stay dignified either way.
 */
export function DetailHero({ item, facts, actions }: Props) {
  const { width } = useWindowDimensions();
  const backdrop = item.artwork?.backdrop ?? item.artwork?.thumbnail;
  const poster = item.artwork?.poster ?? item.artwork?.thumbnail ?? item.artwork?.backdrop;
  const backdropHeight = Math.round(width * 0.56);
  const square = item.kind === 'album' || item.kind === 'artist' || item.kind === 'track';
  const posterWidth = square ? 132 : 118;
  const posterHeight = square ? posterWidth : Math.round(posterWidth * 1.5);

  const shownFacts = (facts ?? []).filter(Boolean) as string[];

  return (
    <View>
      {backdrop ? (
        <View style={[styles.backdrop, { height: backdropHeight }]}>
          <Artwork artwork={backdrop} style={StyleSheet.absoluteFill} borderRadius={0} />
          <LinearGradient
            colors={['transparent', 'rgba(14,14,15,0.55)', colors.background]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      <View style={[styles.body, backdrop ? styles.bodyOverlapping : styles.bodyPlain]}>
        <View style={styles.row}>
          <Artwork
            artwork={poster}
            fallbackText={item.title}
            style={{ width: posterWidth, height: posterHeight }}
            borderRadius={radius.md}
          />
          <View style={styles.headings}>
            {item.playbackContext ? (
              <Text numberOfLines={1} style={styles.eyebrow}>
                {item.playbackContext.series.title.toUpperCase()}
              </Text>
            ) : null}
            <Text style={styles.title}>{item.title}</Text>
            {shownFacts.length > 0 ? (
              <Text style={styles.facts}>{shownFacts.join('  ·  ')}</Text>
            ) : null}
          </View>
        </View>

        {actions ? <View style={styles.actions}>{actions}</View> : null}

        {item.synopsis ? <Text style={styles.synopsis}>{item.synopsis}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    width: '100%',
    backgroundColor: colors.surface,
  },
  body: {
    paddingHorizontal: space.lg,
  },
  bodyOverlapping: {
    marginTop: -54,
  },
  bodyPlain: {
    marginTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'flex-end',
  },
  headings: {
    flex: 1,
    paddingBottom: space.xs,
  },
  eyebrow: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.xs,
  },
  title: {
    ...typography.display,
    fontSize: 23,
    color: colors.text,
  },
  facts: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.xl,
  },
  synopsis: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
    marginTop: space.xl,
  },
});
