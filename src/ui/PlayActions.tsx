import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import { playbackVersions, type VersionStep } from '@machafoundation/core';
import { useAsync } from '../hooks/useAsync';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import {
  ceilingExplanation,
  deviceQualityCeiling,
  largerOffered,
  offerEverything,
  offeredVersions,
  qualityLabel,
  screenQualityClass,
} from '../playback/quality';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import type { MediaSummary } from '../types';
import { PlayIcon } from './Icons';
import { Button } from './controls';
import { formatDuration } from './format';
import { colors, space, type as typography } from './theme';

interface Props {
  /** The item to play, and the queue it should play within. */
  item: MediaSummary;
  queue?: readonly MediaSummary[];
}

/**
 * The play controls for a detail screen. A partly watched item offers Resume
 * as the primary action with Play from start beside it, so neither choice is
 * ever hidden behind a menu.
 *
 * Beside them, one button per quality the item offers (Tom, 2026-09-25):
 * Play decides, and a quality button is the viewer deciding, never capped.
 * They start where the primary button would. Nothing above this screen is
 * offered unless the viewer turned on "Offer everything" (`offeredVersions`).
 * A downloaded item plays off the disk whatever is pressed, so it offers none.
 */
export function PlayActions({ item, queue }: Props) {
  const { continueWatching, playback, downloads } = useMacha();
  const { start, busy } = usePlayback();
  const router = useRouter();

  const resumeMs = useMemo(() => continueWatching.positionFor(item.id), [continueWatching, item.id]);
  const stored = downloads.localFor(item)?.localUri !== undefined;

  const facts = useAsync(
    (signal) => (stored ? Promise.resolve(undefined) : playback.facts({ itemId: item.id }, signal)),
    [playback, item.id, stored],
  );
  const everything = useSyncExternalStore(offerEverything.subscribe, offerEverything.getSnapshot);
  const versions = useMemo(() => {
    if (!facts.value) return undefined;
    const ceiling = deviceQualityCeiling();
    const all = playbackVersions(facts.value, deviceCapabilities(), {
      overrides: devicePlaybackOverrides(),
      mediaIds: item.mediaIds,
      ...(ceiling ? { ceiling } : {}),
    });
    return offeredVersions(all, screenQualityClass(), everything);
  }, [facts.value, item.mediaIds, everything]);

  const play = useCallback(
    (seekMs?: number, version?: VersionStep) => {
      const items = queue && queue.length > 0 ? queue : [item];
      const index = Math.max(0, items.findIndex((candidate) => candidate.id === item.id));
      const options = {
        ...(seekMs === undefined ? {} : { seekMs }),
        ...(version ? { version } : {}),
      };
      void start(items, index, Object.keys(options).length > 0 ? options : undefined);
      router.navigate('/play');
    },
    [item, queue, router, start],
  );

  const qualities = versions ? (
    <>
      {versions.steps.map((step) => (
        <Button
          key={`${step.quality}-${step.mediaId ?? ''}`}
          label={qualityLabel(step.quality)}
          variant="secondary"
          onPress={() => play(resumeMs > 0 ? resumeMs : 0, step)}
          disabled={busy}
        />
      ))}
      {versions.limitedBy ? (
        <Text style={styles.limited}>{ceilingExplanation(versions.limitedBy, largerOffered(versions))}</Text>
      ) : null}
    </>
  ) : null;

  if (resumeMs > 0) {
    return (
      <>
        <Button
          label={`Resume ${formatDuration(resumeMs)}`}
          icon={<PlayIcon size={18} color={colors.text} />}
          onPress={() => play(resumeMs)}
          busy={busy}
        />
        <Button label="From start" variant="secondary" onPress={() => play(0)} disabled={busy} />
        {qualities}
      </>
    );
  }

  return (
    <>
      <Button label="Play" icon={<PlayIcon size={18} color={colors.text} />} onPress={() => play(0)} busy={busy} />
      {qualities}
    </>
  );
}

const styles = StyleSheet.create({
  limited: {
    ...typography.caption,
    color: colors.textFaint,
    width: '100%',
  },
});
