import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import type { MediaSummary } from '../types';
import { PlayIcon } from './Icons';
import { Button } from './controls';
import { formatDuration } from './format';
import { colors } from './theme';

interface Props {
  /** The item to play, and the queue it should play within. */
  item: MediaSummary;
  queue?: readonly MediaSummary[];
}

/**
 * The play controls for a detail screen. A partly watched item offers Resume
 * as the primary action with Play from start beside it, so neither choice is
 * ever hidden behind a menu.
 */
export function PlayActions({ item, queue }: Props) {
  const { continueWatching } = useMacha();
  const { start, busy } = usePlayback();
  const router = useRouter();

  const resumeMs = useMemo(() => continueWatching.positionFor(item.id), [continueWatching, item.id]);

  const play = useCallback(
    (seekMs?: number) => {
      const items = queue && queue.length > 0 ? queue : [item];
      const index = Math.max(0, items.findIndex((candidate) => candidate.id === item.id));
      void start(items, index, seekMs === undefined ? undefined : { seekMs });
      router.navigate('/play');
    },
    [item, queue, router, start],
  );

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
      </>
    );
  }

  return (
    <Button label="Play" icon={<PlayIcon size={18} color={colors.text} />} onPress={() => play(0)} busy={busy} />
  );
}
