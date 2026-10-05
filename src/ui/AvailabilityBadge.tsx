import { StyleSheet, View } from 'react-native';
import type { MediaSummary } from '../types';
import { availabilityMarker, mayPlay } from '../playback/availability';
import { useMacha } from '../providers/MachaProvider';
import { BlockedIcon, QuestionIcon, WarningIcon } from './Icons';
import { colors, radius, space } from './theme';

export { UNAVAILABLE_OPACITY } from './theme';

/** Availability icon at the top left of a title's artwork; rules in `playback/availability.ts`. */
export function AvailabilityBadge({
  item,
  size = 18,
  inline = false,
}: {
  item: MediaSummary;
  size?: number;
  /** In the flow of a row with no artwork to sit on, ahead of the title. */
  inline?: boolean;
}) {
  const { downloads } = useMacha();
  const marker = availabilityMarker(item, downloads.localFor(item)?.localUri !== undefined);
  if (!marker) return null;
  const Icon = marker === 'partial' ? WarningIcon : marker === 'unavailable' ? BlockedIcon : QuestionIcon;
  return (
    <View pointerEvents="none" style={inline ? styles.inline : [styles.badge, { width: size + 8, height: size + 8 }]}>
      <Icon size={size} color={marker === 'unavailable' ? colors.markerRed : colors.markerYellow} />
    </View>
  );
}

/** True when a title is unavailable on the cluster and not downloaded: greyed out and not selectable. */
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
    backgroundColor: colors.markerDisc,
  },
  inline: {
    marginRight: space.xs,
  },
});
