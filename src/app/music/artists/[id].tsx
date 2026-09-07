import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useAsync } from '../../../hooks/useAsync';
import { useMacha } from '../../../providers/MachaProvider';
import type { ArtistDetails } from '../../../types';
import { DetailHero } from '../../../ui/DetailHero';
import { MediaGrid } from '../../../ui/MediaGrid';
import { Screen } from '../../../ui/Screen';
import { EmptyState, ErrorState, Loading } from '../../../ui/Status';
import { pluralize } from '../../../ui/format';
import { space } from '../../../ui/theme';
import { useOpenMedia } from '../../../ui/navigation';

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);

  const artist = detail.value as ArtistDetails | undefined;
  const albums = artist?.albums ?? [];

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!artist && detail.loading ? <Loading /> : null}
      {!artist && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {artist ? (
        <>
          <DetailHero item={artist} facts={[albums.length > 0 ? pluralize(albums.length, 'album') : undefined]} />
          <View style={{ marginTop: space.xxl }}>
            {albums.length === 0 ? (
              <EmptyState title="No albums for this artist yet" />
            ) : (
              <MediaGrid items={albums} onOpen={openMedia} shape="square" />
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
