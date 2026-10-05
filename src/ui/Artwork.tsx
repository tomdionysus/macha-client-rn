import { Image, type ImageContentFit } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ImageStyle } from 'expo-image';
import { useAuthHeaders, useMacha } from '../providers/MachaProvider';
import type { ArtworkRef } from '../types';
import { colors, radius, type as typography } from './theme';

interface Props {
  artwork?: ArtworkRef;
  /** Rendered when there is no artwork, or every candidate node failed. */
  fallbackText?: string;
  contentFit?: ImageContentFit;
  /** Sizing only. Artwork is a leaf: nothing is composed inside it. */
  style?: StyleProp<ImageStyle & ViewStyle>;
  borderRadius?: number;
}

/**
 * Content-addressed artwork, resolved across the cluster: tries the signed
 * capability URL, then each node's authenticated URL, advancing on failure.
 */
export function Artwork({ artwork, fallbackText, contentFit = 'cover', style, borderRadius = radius.md }: Props) {
  const { media } = useMacha();
  const headers = useAuthHeaders();
  const candidates = useMemo(() => (artwork ? media.artworkUrls(artwork) : []), [artwork, media]);
  const [attempt, setAttempt] = useState(0);

  // Reset so a recycled card does not inherit the previous item's failed attempts.
  useEffect(() => setAttempt(0), [artwork?.id]);

  const source = candidates[attempt];

  if (!source) {
    return (
      <View style={[styles.placeholder, { borderRadius }, style as StyleProp<ViewStyle>]}>
        {fallbackText ? (
          <Text numberOfLines={2} style={styles.placeholderText}>
            {initials(fallbackText)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Image
      style={[styles.image, { borderRadius }, style]}
      // Signed capability URLs are self-authenticating; send no Authorization to them.
      source={{ uri: source.url, headers: source.requiresAuthorization ? headers : undefined }}
      contentFit={contentFit}
      // Stops a recycled card showing the previous poster while loading.
      recyclingKey={artwork?.id}
      transition={160}
      cachePolicy="memory-disk"
      onError={() => setAttempt((current) => current + 1)}
      // Only on success, so core's host preference follows working nodes.
      onLoad={() => media.noteArtworkLoaded(source.url)}
    />
  );
}

/** Up to two initials, so a missing poster still reads as *something*. */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface2,
  },
  placeholder: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  placeholderText: {
    ...typography.title,
    color: colors.textFaint,
    letterSpacing: 1,
  },
});
