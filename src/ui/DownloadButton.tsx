import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import type { CatalogueMediaProfile } from '@machafoundation/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMacha } from '../providers/MachaProvider';
import { useAsync } from '../hooks/useAsync';
import { downloadChoices } from '../downloads/choice';
import { wrapBetweenFields } from './mediaLines';
import { Sheet, SheetOption } from './Sheet';
import { Loading, Spinner } from './Status';
import { downloadStateOf, useDownloads } from '../hooks/useDownloads';
import type { MediaSummary } from '../types';
import { AlertIcon, CloseIcon, DownloadIcon, DownloadedIcon } from './Icons';
import { useToast } from './Toast';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

/**
 * The download control for a single item.
 *
 * It is a state display as much as a button: not downloaded, queued,
 * transferring with a percentage, stored, or failed and retryable. Tapping a
 * stored item asks before deleting, because the bytes are the point.
 *
 * A title with more than one file opens a chooser first (Tom, 2026-09-28):
 * a download is a copy of one file, so the viewer names which.
 */
export function DownloadButton({ item, compact = false }: { item: MediaSummary; compact?: boolean }) {
  const { downloadManager } = useMacha();
  const snapshot = useDownloads();
  const toast = useToast();
  const router = useRouter();
  const record = downloadStateOf(snapshot, item.mediaIds);
  const size = compact ? 18 : 20;

  // The icon under the finger changes state immediately, but on a dense list
  // that is a very small movement to notice, and the transfer itself happens
  // somewhere the viewer is not looking.
  const [choosing, setChoosing] = useState(false);
  const files = item.mediaIds.filter((mediaId) => mediaId.startsWith('macha:'));
  const enqueue = useCallback((mediaId?: string) => {
    setChoosing(false);
    downloadManager.enqueue([item], mediaId ? { mediaId } : {});
    toast({
      icon: <DownloadIcon size={16} color={colors.progress} />,
      message: `Downloading ${item.title}`,
      action: { label: 'Downloads', onPress: () => router.navigate('/downloads') },
    });
  }, [downloadManager, item, router, toast]);

  if (!item.mediaIds.length) return null;

  if (!record) {
    return (
      <>
        <Control
          label={`Download ${item.title}`}
          onPress={() => (files.length > 1 ? setChoosing(true) : enqueue())}
          compact={compact}>
          <DownloadIcon size={size} color={colors.textFaint} />
        </Control>
        {files.length > 1 ? (
          <DownloadChooser visible={choosing} mediaIds={files} onPick={enqueue} onClose={() => setChoosing(false)} />
        ) : null}
      </>
    );
  }

  if (record.state === 'complete') {
    return (
      <Control
        label={`${item.title} is downloaded. Remove it?`}
        onPress={() => void downloadManager.remove(record.mediaId)}
        compact={compact}>
        <DownloadedIcon size={size} color={colors.ok} />
      </Control>
    );
  }

  if (record.state === 'failed') {
    return (
      <Control label={`Download of ${item.title} failed. Retry?`} onPress={() => downloadManager.retry(record.mediaId)} compact={compact}>
        <AlertIcon size={size} color={colors.danger} />
      </Control>
    );
  }

  const percent =
    record.bytesTotal && record.bytesTotal > 0 && record.bytesWritten
      ? Math.min(99, Math.floor((record.bytesWritten / record.bytesTotal) * 100))
      : undefined;

  return (
    <Control label={`Cancel download of ${item.title}`} onPress={() => downloadManager.cancel(record.mediaId)} compact={compact}>
      {record.state === 'downloading' ? (
        <View style={styles.progress}>
          {percent === undefined ? (
            <Spinner />
          ) : (
            <Text style={styles.percent}>{percent}</Text>
          )}
        </View>
      ) : (
        <CloseIcon size={size} color={colors.textFaint} />
      )}
    </Control>
  );
}

/** The title's files, one row each; picking one downloads it. */
function DownloadChooser({
  visible,
  mediaIds,
  onPick,
  onClose,
}: {
  visible: boolean;
  mediaIds: readonly string[];
  onPick(mediaId?: string): void;
  onClose(): void;
}) {
  const { media, generation } = useMacha();
  const profiles = useAsync<CatalogueMediaProfile[] | undefined>(
    async (signal) =>
      visible
        ? (await Promise.all(mediaIds.map((mediaId) => media.mediaProfile(mediaId, signal).catch(() => undefined)))).filter(
            (profile): profile is CatalogueMediaProfile => profile !== undefined,
          )
        : undefined,
    [media, generation, visible, mediaIds.join(' ')],
  );
  const choices = profiles.value ? downloadChoices(profiles.value) : [];
  return (
    <Sheet visible={visible} title="Download which file?" onClose={onClose}>
      {profiles.loading ? <Loading /> : null}
      {choices.map((choice) => (
        <SheetOption
          key={choice.mediaId}
          label={choice.label}
          detail={wrapBetweenFields(choice.detail)}
          onPress={() => onPick(choice.mediaId)}
        />
      ))}
      {!profiles.loading && choices.length === 0 ? (
        // The profiles would not load: still let the viewer download, and let
        // the file be chosen as playback would.
        <SheetOption label="Download" detail="This title's files could not be described." onPress={() => onPick()} />
      ) : null}
    </Sheet>
  );
}

function Control({
  label,
  onPress,
  compact,
  children,
}: {
  label: string;
  onPress(): void;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.compact : styles.button,
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  compact: {
    width: 34,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  progress: {
    minWidth: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    ...typography.caption,
    fontSize: 11,
    color: colors.progress,
    fontVariant: ['tabular-nums'],
  },
});

export const DOWNLOAD_BUTTON_GAP = space.xs;
