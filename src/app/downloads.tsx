import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDownloads } from '../hooks/useDownloads';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import { offlineMedia, type DownloadRecord } from '../state/downloads';
import { Artwork } from '../ui/Artwork';
import { AlertIcon, CloseIcon, PlayIcon, ShuffleIcon, TrashIcon } from '../ui/Icons';
import { Screen } from '../ui/Screen';
import { EmptyState } from '../ui/Status';
import { Button, Divider } from '../ui/controls';
import { formatBytes, pluralize } from '../ui/format';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../ui/theme';

/**
 * Everything stored on this device.
 *
 * This screen never touches the network. It is the one part of the app that is
 * guaranteed to work in airplane mode, so it reads only local state and local
 * files — including the artwork.
 */
export default function DownloadsScreen() {
  const { downloadManager } = useMacha();
  const { start, setShuffle, media: nowPlaying, busy } = usePlayback();
  const router = useRouter();
  const { complete, pending, failed, storedBytes } = useDownloads();

  const playable = useMemo(() => complete.map(offlineMedia), [complete]);

  const play = useCallback(
    (index: number, shuffled = false) => {
      if (playable.length === 0) return;
      setShuffle(shuffled);
      void start(playable, index);
      router.navigate('/play');
    },
    [playable, router, setShuffle, start],
  );

  const confirmClear = useCallback(() => {
    Alert.alert('Remove all downloads', `This frees ${formatBytes(storedBytes)}. Your library on Macha is untouched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove all', style: 'destructive', onPress: () => void downloadManager.removeAll() },
    ]);
  }, [downloadManager, storedBytes]);

  return (
    <Screen
      title="Downloads"
      showBack
      eyebrow={complete.length > 0 ? `${pluralize(complete.length, 'item')} · ${formatBytes(storedBytes)}` : undefined}>
      {playable.length > 0 ? (
        <View style={styles.actions}>
          <Button label="Play" icon={<PlayIcon size={18} color={colors.text} />} onPress={() => play(0)} disabled={busy} />
          <Button
            label="Shuffle"
            variant="secondary"
            icon={<ShuffleIcon size={18} color={colors.text} />}
            onPress={() => play(Math.floor(Math.random() * playable.length), true)}
            disabled={busy}
          />
          <Button label="Clear" variant="quiet" icon={<TrashIcon size={18} color={colors.danger} />} onPress={confirmClear} />
        </View>
      ) : null}

      {pending.length > 0 ? (
        <Section title={`Downloading · ${pending.length}`}>
          {pending.map((record) => (
            <ProgressRow key={record.mediaId} record={record} onCancel={() => downloadManager.cancel(record.mediaId)} />
          ))}
        </Section>
      ) : null}

      {failed.length > 0 ? (
        <Section title={`Failed · ${failed.length}`}>
          {failed.map((record) => (
            <View key={record.mediaId} style={styles.failedRow}>
              <AlertIcon size={18} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.title}>
                  {record.media.title}
                </Text>
                <Text numberOfLines={2} style={styles.error}>
                  {record.error ?? 'The download did not finish.'}
                </Text>
              </View>
              <Button label="Retry" variant="quiet" onPress={() => downloadManager.retry(record.mediaId)} />
            </View>
          ))}
        </Section>
      ) : null}

      {complete.length === 0 && pending.length === 0 && failed.length === 0 ? (
        <EmptyState
          title="Nothing downloaded yet"
          detail="Tap the download arrow on a track or album while you're on the network. Downloads play with no connection at all."
        />
      ) : null}

      {complete.length > 0 ? (
        <Section title="On this device">
          {complete.map((record, index) => {
            const item = playable[index];
            return (
              <View key={record.mediaId}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${record.media.title}`}
                    onPress={() => play(index)}
                    style={styles.main}>
                    <Artwork
                      artwork={item.artwork?.poster}
                      fallbackText={record.media.title}
                      style={styles.art}
                      borderRadius={radius.sm}
                    />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.title, nowPlaying?.id === record.itemId && styles.playing]}>
                        {record.media.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.meta}>
                        {[
                          record.media.musicContext?.artist?.title,
                          record.media.musicContext?.album.title,
                          formatBytes(record.bytesTotal ?? 0),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${record.media.title} from this device`}
                    hitSlop={8}
                    onPress={() => void downloadManager.remove(record.mediaId)}
                    style={styles.iconButton}>
                    <TrashIcon size={17} color={colors.textFaint} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}

function ProgressRow({ record, onCancel }: { record: DownloadRecord; onCancel(): void }) {
  const fraction =
    record.bytesTotal && record.bytesTotal > 0 && record.bytesWritten ? record.bytesWritten / record.bytesTotal : 0;
  return (
    <View style={styles.progressRow}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.title}>
          {record.media.title}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
        <Text style={styles.meta}>
          {record.state === 'queued'
            ? 'Waiting'
            : record.bytesTotal
              ? `${formatBytes(record.bytesWritten ?? 0)} of ${formatBytes(record.bytesTotal)}`
              : 'Starting'}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8} onPress={onCancel} style={styles.iconButton}>
        <CloseIcon size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  section: {
    marginTop: space.xl,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET,
  },
  art: {
    width: 44,
    height: 44,
  },
  title: {
    ...typography.body,
    color: colors.text,
  },
  playing: {
    color: colors.progress,
    fontWeight: '600',
  },
  meta: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  fill: {
    height: 4,
    backgroundColor: colors.progress,
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
