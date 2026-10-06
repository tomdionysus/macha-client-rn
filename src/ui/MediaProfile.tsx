import { StyleSheet, Text, View } from 'react-native';
import type { CatalogueMediaProfile } from '../api/catalogue';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { fileLines, wrapBetweenFields } from './mediaLines';
import { colors, space, type as typography } from './theme';

/**
 * One technical line per file with a profile (see `mediaLines.ts`). Advisory
 * only: core answers nothing for a non-`macha:` id, and a profile that fails, is
 * pending (202) or missing (404) is just left out.
 */
export function MediaLines({ mediaIds }: { mediaIds: readonly string[] }) {
  const { media, generation } = useMacha();
  const profiles = useAsync<CatalogueMediaProfile[]>(
    async (signal) =>
      (await Promise.all(mediaIds.map((mediaId) => media.mediaProfile(mediaId, signal).catch(() => undefined)))).filter(
        (profile): profile is CatalogueMediaProfile => profile !== undefined,
      ),
    [media, generation, mediaIds.join(' ')],
  );
  const lines = profiles.value ? fileLines(profiles.value) : [];
  if (lines.length === 0) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>Available Direct Formats</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {wrapBetweenFields(line)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: space.lg,
    marginTop: space.xxl,
    gap: 2,
  },
  heading: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.xs,
  },
  line: {
    ...typography.caption,
    color: colors.textDim,
    letterSpacing: 0.3,
    lineHeight: 18,
  },
});
