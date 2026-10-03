import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { playbackVersions, type PlaybackMediaFacts, type VersionStep } from '@machafoundation/core';
import { useAsync, type AsyncResult } from '../hooks/useAsync';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import {
  deviceQualityCeiling,
  offersVersions,
  qualityChoiceText,
  qualityLabel,
  qualityPreferences,
} from '../playback/quality';
import { useMacha } from '../providers/MachaProvider';
import { useUnavailable } from './AvailabilityBadge';
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
  /** The title's files, from `useTitleFacts`, shared with the header's Download. */
  facts: AsyncResult<PlaybackMediaFacts[] | undefined>;
}

/**
 * The play controls for a detail screen. A partly watched item offers Resume
 * as the primary action with Play from start beside it, so neither choice is
 * ever hidden behind a menu.
 *
 * Beside them, one button per quality the item offers:
 * Play decides, and a quality button is the viewer deciding, never capped.
 * They start where the primary button would. Nothing above this device is
 * offered unless the viewer turned on "Offer everything" (core's
 * `playbackVersions`, with `offerAll`).
 * A downloaded item plays off the disk whatever is pressed, so it offers none.
 */
/**
 * A title's playback facts, read once per page: the play buttons need them
 * and so does the Download in the header, which is greyed before a tap where
 * no file plays here. A downloaded title plays off the disk, so it asks for
 * none.
 */
export function useTitleFacts(item: MediaSummary | undefined): AsyncResult<PlaybackMediaFacts[] | undefined> {
  const { playback, downloads } = useMacha();
  const stored = item ? downloads.localFor(item)?.localUri !== undefined : false;
  return useAsync(
    (signal) => (!item || stored ? Promise.resolve(undefined) : playback.facts({ itemId: item.id }, signal)),
    [playback, item?.id, stored],
  );
}

export function PlayActions({ item, queue, facts }: Props) {
  const { continueWatching, playback } = useMacha();
  const blocked = useUnavailable(item);
  const { start, busy } = usePlayback();
  const router = useRouter();

  const resumeMs = useMemo(() => continueWatching.positionFor(item.id), [continueWatching, item.id]);
  const everything = useSyncExternalStore(qualityPreferences.subscribe, qualityPreferences.getSnapshot).offerAll === true;
  const all = useMemo(() => {
    if (!facts.value) return undefined;
    const ceiling = deviceQualityCeiling();
    return playbackVersions(facts.value, deviceCapabilities(), {
      overrides: devicePlaybackOverrides(),
      mediaIds: item.mediaIds,
      offerAll: everything,
      transcodeRate: playback.transcodeRate,
      ...(ceiling ? { ceiling } : {}),
    });
  }, [facts.value, item.mediaIds, everything, playback]);
  const versions = offersVersions(all) ? all : undefined;
  const choice = versions ? qualityChoiceText(versions) : undefined;
  // What the page was drawn from, once per answer: the item's own file list
  // against what the facts route returned. The two can disagree, and only
  // this line tells a missing pill from a missing file.
  useEffect(() => {
    if (!facts.value && !facts.error) return;
    console.log('[macha] [playback] title-files', {
      itemId: item.id,
      itemMediaIds: item.mediaIds,
      facts: facts.value?.map((file) => {
        const video = file.profile.streams.find((stream) => stream.type === 'video');
        return { mediaId: file.mediaId, width: video?.width, height: video?.height, codec: video?.codec };
      }) ?? `error: ${String(facts.error)}`,
      steps: all?.steps.map((step) => step.quality),
    });
  }, [facts.value, facts.error, item.id, item.mediaIds, all]);

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
          disabled={busy || blocked}
        />
      ))}
      {choice ? <Text style={styles.limited}>{choice}</Text> : null}
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
          disabled={blocked}
        />
        <Button label="From start" variant="secondary" onPress={() => play(0)} disabled={busy || blocked} />
        {qualities}
      </>
    );
  }

  return (
    <>
      <Button label="Play" icon={<PlayIcon size={18} color={colors.text} />} onPress={() => play(0)} busy={busy} disabled={blocked} />
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
