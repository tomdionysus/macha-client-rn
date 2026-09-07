import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import { Library } from '../../ui/Library';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';
import { useOpenMedia } from '../../ui/navigation';

export default function MoviesScreen() {
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const movies = useAsync((signal) => media.movies(signal), [media, generation]);

  return (
    <Screen title="Films" onRefresh={movies.refresh} refreshing={movies.refreshing}>
      {!movies.value && movies.loading ? <Loading /> : null}
      {!movies.value && movies.error ? <ErrorState error={movies.error} onRetry={movies.refresh} /> : null}
      {movies.value ? <Library items={movies.value} onOpen={openMedia} noun="films" /> : null}
    </Screen>
  );
}
