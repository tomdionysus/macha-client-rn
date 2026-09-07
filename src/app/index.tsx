import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { newestCatalogueFirst } from '../api/media';
import { useAsync } from '../hooks/useAsync';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import type { MediaSummary, PlaybackProgress } from '../types';
import { HeaderButton, Screen } from '../ui/Screen';
import { ErrorState, InlineError, Loading } from '../ui/Status';
import { MediaRow } from '../ui/MediaRow';
import { MachaLogo } from '../ui/Logo';
import { SettingsIcon } from '../ui/Icons';
import { describeError } from '../api/errors';
import { useOpenMedia } from '../ui/navigation';

/** How many of each kind the Home rails show before "See all" takes over. */
const RAIL_LIMIT = 14;

export default function HomeScreen() {
  const { media, endpoints, continueWatching, generation } = useMacha();
  const { playItem } = usePlayback();
  const router = useRouter();
  const openMedia = useOpenMedia();

  const home = useAsync((signal) => media.home(signal), [media, generation]);
  const [resumable, setResumable] = useState<PlaybackProgress[]>(() => continueWatching.list());

  const refresh = useCallback(() => {
    setResumable(continueWatching.list());
    home.refresh();
  }, [continueWatching, home]);

  const progressByItem = useMemo(
    () => new Map(resumable.map((entry) => [entry.mediaId, entry])),
    [resumable],
  );
  const resumableItems = useMemo(
    () => resumable.flatMap((entry) => (entry.media ? [entry.media] : [])),
    [resumable],
  );

  const resume = useCallback(
    (item: MediaSummary) => {
      void playItem(item);
      router.navigate('/play');
    },
    [playItem, router],
  );

  const removeResumable = useCallback(
    (item: MediaSummary) => setResumable(continueWatching.clear(item.id)),
    [continueWatching],
  );

  if (endpoints.length === 0) return <Redirect href="/connect" />;

  return (
    <Screen
      title="Macha"
      leading={<MachaLogo size={34} />}
      onRefresh={refresh}
      refreshing={home.refreshing}
      headerRight={
        <HeaderButton label="Settings" onPress={() => router.navigate('/settings')}>
          <SettingsIcon size={20} />
        </HeaderButton>
      }>
      {!home.value && home.loading ? <Loading /> : null}
      {!home.value && home.error ? <ErrorState error={home.error} onRetry={home.refresh} /> : null}
      {home.value && home.error ? <InlineError message={`Refresh failed: ${describeError(home.error)}`} /> : null}

      {home.value ? (
        <>
          {resumableItems.length > 0 ? (
            <MediaRow
              title="Continue watching"
              items={resumableItems}
              onOpen={resume}
              progress={progressByItem}
              onRemove={removeResumable}
            />
          ) : null}
          <MediaRow
            title="Films"
            items={newestCatalogueFirst(home.value.movies).slice(0, RAIL_LIMIT)}
            onOpen={openMedia}
            onSeeAll={() => router.navigate('/movies')}
            emptyLabel="No films in this catalogue yet."
          />
          <MediaRow
            title="TV"
            items={newestCatalogueFirst(home.value.shows).slice(0, RAIL_LIMIT)}
            onOpen={openMedia}
            onSeeAll={() => router.navigate('/shows')}
            emptyLabel="No series in this catalogue yet."
          />
          <MediaRow
            title="Music"
            items={newestCatalogueFirst(home.value.albums).slice(0, RAIL_LIMIT)}
            onOpen={openMedia}
            onSeeAll={() => router.navigate('/music')}
            emptyLabel="No albums in this catalogue yet."
          />
        </>
      ) : null}
    </Screen>
  );
}
