import React from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import { Library } from '../../ui/Library';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';
import { useOpenMedia } from '../../ui/navigation';

export default function ShowsScreen() {
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const shows = useAsync((signal) => media.shows(signal), [media, generation]);

  return (
    <Screen title="TV" onRefresh={shows.refresh} refreshing={shows.refreshing}>
      {!shows.value && shows.loading ? <Loading /> : null}
      {!shows.value && shows.error ? <ErrorState error={shows.error} onRetry={shows.refresh} /> : null}
      {shows.value ? <Library items={shows.value} onOpen={openMedia} noun="series" /> : null}
    </Screen>
  );
}
