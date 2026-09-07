import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CatalogueMediaProfile } from '../api/catalogue';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { Tag } from './controls';
import { describeStream, formatBitrate, formatChannels, formatLanguage, formatRuntime } from './format';
import { colors, space, type as typography } from './theme';

/**
 * The immutable technical profile of a media object, when the node has one.
 *
 * This is advisory metadata and never a precondition for playback: a node that
 * answers `202 profile_pending` or 404 simply produces nothing here, and the
 * play buttons above are unaffected.
 */
export function MediaProfileFacts({ mediaId }: { mediaId: string | undefined }) {
  const { media, generation } = useMacha();
  const profile = useAsync<CatalogueMediaProfile | undefined>(
    async (signal) => (mediaId ? media.mediaProfile(mediaId, signal) : undefined),
    [media, generation, mediaId],
  );

  const value = profile.value;
  if (!value) return null;

  const video = value.streams.find((stream) => stream.type === 'video' && !stream.attached_picture);
  const audio = value.streams.filter((stream) => stream.type === 'audio');
  const subtitles = value.streams.filter((stream) => stream.type === 'subtitle');

  return (
    <View style={styles.block}>
      <Text style={styles.heading}>MEDIA</Text>
      <View style={styles.tags}>
        {value.format ? <Tag label={value.format.toUpperCase()} /> : null}
        {video?.height ? <Tag label={`${video.height}p`} /> : null}
        {video?.codec ? <Tag label={video.codec.toUpperCase()} /> : null}
        {formatBitrate(value.bitrate) ? <Tag label={formatBitrate(value.bitrate)!} /> : null}
        {formatRuntime(value.duration_ms) ? <Tag label={formatRuntime(value.duration_ms)!} /> : null}
      </View>

      {audio.length > 0 ? (
        <Text style={styles.line}>
          <Text style={styles.lineLabel}>Audio · </Text>
          {audio
            .map((stream) =>
              [formatLanguage(stream.language), stream.codec?.toUpperCase(), formatChannels(stream.channels)]
                .filter(Boolean)
                .join(' '),
            )
            .join(', ')}
        </Text>
      ) : null}

      {subtitles.length > 0 ? (
        <Text style={styles.line}>
          <Text style={styles.lineLabel}>Subtitles · </Text>
          {subtitles.map((stream) => formatLanguage(stream.language)).join(', ')}
        </Text>
      ) : null}

      {video ? (
        <Text style={styles.line}>
          <Text style={styles.lineLabel}>Video · </Text>
          {describeStream({ codec: video.codec, height: video.height, bitrate: video.bitrate })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: space.lg,
    marginTop: space.xxl,
    gap: space.sm,
  },
  heading: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
  },
  line: {
    ...typography.caption,
    color: colors.textDim,
    lineHeight: 18,
  },
  lineLabel: {
    color: colors.textFaint,
  },
});
