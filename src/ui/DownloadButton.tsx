import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import type { PlaybackMediaFacts } from '@machafoundation/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMacha } from '../providers/MachaProvider';
import { NOT_AVAILABLE_HERE, downloadChoices, playableHere } from '../downloads/choice';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import { wrapBetweenFields } from './mediaLines';
import { Sheet, SheetOption } from './Sheet';
import { Spinner } from './Status';
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
 * a download is a copy of one file, so the viewer names which. A title none
 * of whose files this device can play off the disk cannot be downloaded: the
 * button is grey, and tapping it says "Not available for this device".
 *
 * `files` are the title's playback facts where the screen already has them
 * (the title page), so the verdict shows before a tap. Without them (a row
 * in a list) the facts are fetched on the tap, rather than once per row.
 */
export function DownloadButton({
  item,
  compact = false,
  files: known,
}: {
  item: MediaSummary;
  compact?: boolean;
  files?: readonly PlaybackMediaFacts[];
}) {
  const { downloadManager, playback } = useMacha();
  const snapshot = useDownloads();
  const toast = useToast();
  const router = useRouter();
  const record = downloadStateOf(snapshot, item.mediaIds);
  const size = compact ? 18 : 20;

  // The icon under the finger changes state immediately, but on a dense list
  // that is a very small movement to notice, and the transfer itself happens
  // somewhere the viewer is not looking.
  const [choosing, setChoosing] = useState(false);
  const [fetched, setFetched] = useState<readonly PlaybackMediaFacts[] | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const facts = known ?? fetched;
  const available = facts ? anyPlayableHere(facts) : undefined;
  const enqueue = useCallback((mediaId?: string) => {
    setChoosing(false);
    downloadManager.enqueue([item], mediaId ? { mediaId } : {});
    toast({
      icon: <DownloadIcon size={16} color={colors.progress} />,
      message: `Downloading ${item.title}`,
      action: { label: 'Downloads', onPress: () => router.navigate('/downloads') },
    });
  }, [downloadManager, item, router, toast]);

  const unavailable = useCallback(
    () => toast({ icon: <DownloadIcon size={16} color={colors.textFaint} />, message: `${NOT_AVAILABLE_HERE}.` }),
    [toast],
  );

  const start = useCallback(async () => {
    let current = facts;
    if (!current) {
      setChecking(true);
      current = await playback.facts({ itemId: item.id }).catch(() => undefined);
      setChecking(false);
      if (current) setFetched(current);
    }
    // Without facts (the node cannot be asked) this is the download as it
    // was: the manager checks again before it fetches anything.
    if (current && !anyPlayableHere(current)) unavailable();
    else if (current && current.length > 1) setChoosing(true);
    else enqueue();
  }, [enqueue, facts, item.id, playback, unavailable]);

  if (!item.mediaIds.length) return null;

  if (!record) {
    if (available === false) {
      return (
        <Control label={`Download ${item.title}`} hint={`${NOT_AVAILABLE_HERE}.`} disabled onPress={unavailable} compact={compact}>
          <DownloadIcon size={size} color={compact ? colors.textFaint : colors.text} />
        </Control>
      );
    }
    return (
      <>
        <Control label={`Download ${item.title}`} onPress={() => void start()} compact={compact}>
          {checking ? <Spinner /> : <DownloadIcon size={size} color={compact ? colors.textFaint : colors.text} />}
        </Control>
        {facts && facts.length > 1 ? (
          <DownloadChooser visible={choosing} files={facts} onPick={enqueue} onClose={() => setChoosing(false)} />
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

  // Refused by the manager, not failed: retrying cannot help.
  if (record.state === 'failed' && record.error === `${NOT_AVAILABLE_HERE}.`) {
    return (
      <Control label={`Download ${item.title}`} hint={`${NOT_AVAILABLE_HERE}.`} disabled onPress={unavailable} compact={compact}>
        <DownloadIcon size={size} color={compact ? colors.textFaint : colors.text} />
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

function anyPlayableHere(files: readonly PlaybackMediaFacts[]): boolean {
  const capabilities = deviceCapabilities();
  const overrides = devicePlaybackOverrides();
  return files.some((file) => playableHere(file, capabilities, overrides));
}

/**
 * The title's files, one row each; picking one downloads it. A file this
 * device cannot play off the disk is listed, greyed, and says so.
 */
function DownloadChooser({
  visible,
  files,
  onPick,
  onClose,
}: {
  visible: boolean;
  files: readonly PlaybackMediaFacts[];
  onPick(mediaId?: string): void;
  onClose(): void;
}) {
  const choices = downloadChoices(files, deviceCapabilities(), devicePlaybackOverrides());
  return (
    <Sheet visible={visible} title="Download which file?" onClose={onClose}>
      {choices.map((choice) => (
        <SheetOption
          key={choice.mediaId}
          label={choice.label}
          detail={wrapBetweenFields(choice.detail)}
          disabled={!choice.available}
          onPress={() => onPick(choice.mediaId)}
        />
      ))}
    </Sheet>
  );
}

function Control({
  label,
  hint,
  disabled = false,
  onPress,
  compact,
  children,
}: {
  label: string;
  hint?: string;
  /** Greyed, but still pressable: a tap on it says why (phones have no hover). */
  disabled?: boolean;
  onPress(): void;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.compact : styles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A title page's Download sits in the header across from Back (Tom,
  // 2026-09-28), so it looks like the header's other buttons.
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  disabled: {
    opacity: 0.35,
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
