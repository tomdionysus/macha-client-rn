import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CatalogueMediaProfile } from '../api/catalogue';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { fileLines, wrapBetweenFields } from './mediaLines';
import { colors, type as typography } from './theme';

/**
 * One line per file, under the title (Tom, 2026-09-27: copy the web's style,
 * formatted for the device; see `mediaLines.ts`). Every `macha:` file of the
 * item is read, and a file whose profile cannot be read is left out rather
 * than failing the others. Lines wrap at the device's width rather than
 * truncate, since every field carries something, and only between fields
 * (`wrapBetweenFields`).
 *
 * Advisory metadata, never a precondition for playback: a node that answers
 * `202 profile_pending` or 404 simply produces nothing here.
 */
export function MediaLines({ mediaIds }: { mediaIds: readonly string[] }) {
  const { media, generation } = useMacha();
  const files = mediaIds.filter((mediaId) => mediaId.startsWith('macha:'));
  const profiles = useAsync<CatalogueMediaProfile[]>(
    async (signal) =>
      (await Promise.all(files.map((mediaId) => media.mediaProfile(mediaId, signal).catch(() => undefined)))).filter(
        (profile): profile is CatalogueMediaProfile => profile !== undefined,
      ),
    [media, generation, files.join(' ')],
  );
  const lines = profiles.value ? fileLines(profiles.value) : [];
  if (lines.length === 0) return null;
  return (
    <View style={styles.lines}>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {wrapBetweenFields(line)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lines: {
    width: '100%',
    gap: 2,
  },
  line: {
    ...typography.caption,
    color: colors.textDim,
    letterSpacing: 0.3,
    lineHeight: 18,
  },
});
