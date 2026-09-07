import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import type { Episode } from '../../types';
import { DetailHero } from '../../ui/DetailHero';
import { MediaProfileFacts } from '../../ui/MediaProfile';
import { PlayActions } from '../../ui/PlayActions';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation } = useMacha();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);
  const episode = detail.value as Episode | undefined;

  // The rest of the season is loaded separately so the page renders as soon as
  // the episode itself is known, rather than waiting on its siblings.
  const siblings = useAsync(
    async (signal) =>
      episode?.playbackContext ? media.episodesOfSeason(episode.playbackContext.season.id, signal) : [],
    [media, generation, episode?.playbackContext?.season.id],
  );

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!episode && detail.loading ? <Loading /> : null}
      {!episode && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {episode ? (
        <>
          <DetailHero
            item={episode}
            facts={[
              episode.playbackContext?.season.title,
              episode.subtitle,
              episode.year ? String(episode.year) : undefined,
            ]}
            actions={<PlayActions item={episode} queue={siblings.value} />}
          />
          <MediaProfileFacts mediaId={episode.mediaIds[0]} />
        </>
      ) : null}
    </Screen>
  );
}
