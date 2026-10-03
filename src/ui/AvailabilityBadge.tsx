import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MediaSummary } from '../types';
import { availabilityMarker, mayPlay } from '../playback/availability';
import { useMacha } from '../providers/MachaProvider';
import { BlockedIcon, QuestionIcon, WarningIcon } from './Icons';
import { colors, radius, space } from './theme';

export { UNAVAILABLE_OPACITY } from './theme';

/**
 * The availability marker at the top left of a title's artwork: icons alone
 * on the phone. See `playback/availability.ts` for the ruling.
 */
export function AvailabilityBadge({
  item,
  size = 18,
  inline = false,
}: {
  item: Pick<MediaSummary, 'availability'>;
  size?: number;
  /** In the flow of a row with no artwork to sit on, ahead of the title. */
  inline?: boolean;
}) {
  const marker = availabilityMarker(item);
  if (!marker) return null;
  const Icon = marker === 'partial' ? WarningIcon : marker === 'unavailable' ? BlockedIcon : QuestionIcon;
  return (
    <View pointerEvents="none" style={inline ? styles.inline : [styles.badge, { width: size + 8, height: size + 8 }]}>
      <Icon size={size} color={marker === 'unknown' ? colors.warn : colors.danger} />
    </View>
  );
}

/**
 * Whether a title is held back: unavailable on the cluster and not on the
 * disk. Such a title is greyed out and not selectable.
 */
export function useUnavailable(item: MediaSummary): boolean {
  return heldBack(item, useMacha().downloads);
}

/** `useUnavailable` for a list drawn in one component. */
export function heldBack(item: MediaSummary, downloads: { localFor(item: MediaSummary): { localUri?: string } | undefined }): boolean {
  return !mayPlay(item, downloads.localFor(item)?.localUri !== undefined);
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: space.xs,
    top: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  inline: {
    marginRight: space.xs,
  },
});
