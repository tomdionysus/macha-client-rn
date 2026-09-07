import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { newestCatalogueFirst } from '../api/media';
import { useAsync } from '../hooks/useAsync';
import { useConnectivity, useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import type { MediaSummary, PlaybackProgress } from '../types';
import { HeaderButton, Screen } from '../ui/Screen';
import { ErrorState, InlineError, Loading } from '../ui/Status';
import { MediaRow } from '../ui/MediaRow';
import { MachaLogo } from '../ui/Logo';
import { SettingsIcon } from '../ui/Icons';
import { describeError } from '../api/errors';
import { useOpenMedia } from '../ui/navigation';
import { offlineMedia } from '../state/downloads';

/** How many of each kind the Home rails show before "See all" takes over. */
const RAIL_LIMIT = 14;

export default function HomeScreen() {
  const { media, endpoints, continueWatching, downloads, generation } = useMacha();
  const { offline } = useConnectivity();
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
  /**
   * Continue watching, narrowed to what can actually be played right now.
   *
   * Progress is device-local, so the list survives the network going away and
   * would otherwise keep offering items whose bytes are on a node that cannot
   * be reached — an offer that can only fail. Offline it is restricted to
   * downloads, and each entry is swapped for its stored form so the cover comes
   * off the disk rather than from the cluster.
   */
  const resumableItems = useMemo(
    () =>
      resumable.flatMap((entry) => {
        if (!entry.media) return [];
        if (!offline) return [entry.media];
        const stored = downloads.localFor(entry.media);
        return stored ? [offlineMedia(stored)] : [];
      }),
    [resumable, offline, downloads],
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
