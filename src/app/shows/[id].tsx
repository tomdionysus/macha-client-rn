import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useAsync } from '../../hooks/useAsync';
import { useMacha } from '../../providers/MachaProvider';
import type { ShowDetails } from '../../types';
import { Artwork } from '../../ui/Artwork';
import { ChevronRightIcon } from '../../ui/Icons';
import { DetailHero } from '../../ui/DetailHero';
import { Screen } from '../../ui/Screen';
import { ErrorState, Loading } from '../../ui/Status';
import { Divider, ListRow } from '../../ui/controls';
import { pluralize } from '../../ui/format';
import { colors, radius, space } from '../../ui/theme';
import { useOpenMedia } from '../../ui/navigation';

export default function ShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { media, generation } = useMacha();
  const openMedia = useOpenMedia();
  const detail = useAsync((signal) => media.details(id, signal), [media, generation, id]);

  const show = detail.value as ShowDetails | undefined;
  const seasons = show?.seasons ?? [];

  return (
    <Screen showBack onRefresh={detail.refresh} refreshing={detail.refreshing}>
      {!show && detail.loading ? <Loading /> : null}
      {!show && detail.error ? <ErrorState error={detail.error} onRetry={detail.refresh} /> : null}
      {show ? (
        <>
          <DetailHero
            item={show}
            facts={[
              show.year ? String(show.year) : undefined,
              seasons.length > 0 ? pluralize(seasons.length, 'season') : undefined,
            ]}
          />
          <View style={{ marginTop: space.xxl }}>
            {seasons.map((season, index) => (
              <View key={season.id}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={season.title}
                  detail={season.year ? String(season.year) : undefined}
                  onPress={() => openMedia(season)}
                  leading={
                    <Artwork
                      artwork={season.artwork?.poster ?? show.artwork?.poster}
                      fallbackText={season.title}
                      style={{ width: 42, height: 63 }}
                      borderRadius={radius.sm}
                    />
                  }
                  trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
                />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
