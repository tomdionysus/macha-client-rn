import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import type { MediaSummary } from '../../types';
import { DetailHero } from '../../ui/DetailHero';
import { MediaProfileFacts } from '../../ui/MediaProfile';
import { PlayActions } from '../../ui/PlayActions';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation } = useMacha();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);

  const movie = detail.value as MediaSummary | undefined;

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!movie && detail.loading ? <Loading /> : null}
      {!movie && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {movie ? (
        <>
          <DetailHero
            item={movie}
            facts={[movie.year ? String(movie.year) : undefined, 'Film']}
            actions={<PlayActions item={movie} />}
          />
          <MediaProfileFacts mediaId={movie.mediaIds[0]} />
        </>
      ) : null}
    </Screen>
  );
}
