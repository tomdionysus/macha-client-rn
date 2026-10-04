import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import type { Episode } from '../../types';
import { DetailHero } from '../../ui/DetailHero';
import { MediaLines } from '../../ui/MediaProfile';
import { PlayActions, useTitleFacts } from '../../ui/PlayActions';
import { DownloadButton } from '../../ui/DownloadButton';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';
import { episodeCode } from '../../ui/labels';

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation } = useMacha();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);
  const episode = detail.value as Episode | undefined;

  // Siblings load separately so the page renders as soon as the episode is known.
  const siblings = useAsync(
    async (signal) =>
      episode?.playbackContext ? media.episodesOfSeason(episode.playbackContext.season.id, signal) : [],
    [media, generation, episode?.playbackContext?.season.id],
  );
  const facts = useTitleFacts(episode);

  return (
    <Screen
      showBack
      headerRight={episode ? <DownloadButton item={episode} files={facts.value} /> : undefined}
      onRefresh={detail.refresh}
      refreshing={detail.refreshing}>
      {!episode && detail.loading ? <Loading /> : null}
      {!episode && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {episode ? (
        <>
          <DetailHero
            item={episode}
            facts={[
              episode.playbackContext?.season.title,
              episodeCode(episode),
              episode.year ? String(episode.year) : undefined,
            ]}
            actions={<PlayActions item={episode} queue={siblings.value} facts={facts} />}
          />
          <MediaLines mediaIds={episode.mediaIds} />
        </>
      ) : null}
    </Screen>
  );
}
