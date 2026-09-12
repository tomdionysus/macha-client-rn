import { Image, type ImageContentFit } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
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
 * Artwork, resolved across the cluster.
 *
 * Artwork objects are content-addressed, so any node holding the object will
 * serve it. The component walks its candidate URLs in order — the node's signed
 * capability URL first, then the authenticated per-node object URLs — and moves
 * to the next only when one actually fails. A failure is therefore never a
 * permanently blank poster while another node still has the bytes.
 */
export function Artwork({ artwork, fallbackText, contentFit = 'cover', style, borderRadius = radius.md }: Props) {
  const { media } = useMacha();
  const headers = useAuthHeaders();
  const candidates = useMemo(() => (artwork ? media.artworkUrls(artwork) : []), [artwork, media]);
  const [attempt, setAttempt] = useState(0);

  // A different artwork object restarts the walk; otherwise a card recycled
  // onto new content would inherit the previous item's exhausted attempts.
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
      // Headers only where the source needs them. A signed capability URL is
      // self-authenticating, and sending the session's Authorization header to
      // something that did not ask for it is a habit worth not having.
      source={{ uri: source.url, headers: source.requiresAuthorization ? headers : undefined }}
      contentFit={contentFit}
      // Recycled cards must not show the previous poster while the new one
      // loads; keying on the object identity forces a clean swap.
      recyclingKey={artwork?.id}
      transition={160}
      cachePolicy="memory-disk"
      onError={() => setAttempt((current) => current + 1)}
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
