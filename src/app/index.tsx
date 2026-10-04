import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { newestCatalogueFirst } from '../api/media';
import { useAsync } from '../hooks/useAsync';
import { useCurrentAvailability } from '../hooks/useCurrentAvailability';
import { useMacha, useProblems } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import type { MediaSummary, PlaybackProgress } from '../types';
import { HeaderButton, Screen } from '../ui/Screen';
import { ErrorState, InlineError, Loading, Notice } from '../ui/Status';
import { MediaRow } from '../ui/MediaRow';
import { MachaLogo } from '../ui/Logo';
import { SettingsIcon } from '../ui/Icons';
import { AccountMarker } from '../ui/AccountMarker';
import { refreshFailureMessage } from '../api/failureMessages';
import { useOpenMedia } from '../ui/navigation';
import { offlineMedia } from '../state/downloads';
import { localCopyOf, useDownloads } from '../hooks/useDownloads';
import { clusterMediaUnavailable, describeEmptyLibrary } from '../state/problems';
import { sessionEndedNotice, sessionExpiryNotice } from '../account/expiry';
import { belongsInContinueWatching } from '../playback/resume';

/** How many of each kind the Home rails show before "See all" takes over. */
const RAIL_LIMIT = 14;

export default function HomeScreen() {
  const { media, endpoints, continueWatching, generation, account } = useMacha();
  const problems = useProblems();
  const { playItem } = usePlayback();
  const router = useRouter();
  const openMedia = useOpenMedia();
  const downloads = useDownloads();

  const home = useAsync((signal) => media.home(signal), [media, generation]);
  const [resumable, setResumable] = useState<PlaybackProgress[]>(() => continueWatching.list());

  const refresh = useCallback(() => {
    setResumable(continueWatching.list());
    home.refresh();
  }, [continueWatching, home]);

  const progressByItem = useMemo(
    () => new Map(resumable.map((entry) => [entry.itemId, entry])),
    [resumable],
  );
  /**
   * Continue watching, limited to what can play now. Progress is device-local, so
   * when cluster media is unreachable this narrows to downloads, in their stored
   * form so covers come from disk. Keyed on `clusterMediaUnavailable`, not
   * "offline": a cluster that refuses this viewer is reachable but plays nothing.
   */
  const unavailable = clusterMediaUnavailable(problems);
  // Read at render with no timer: the expiry window is days wide, so the next
  // render is soon enough. Expiry and an ended named login cannot both apply.
  const accountNotice = sessionExpiryNotice(account, Date.now()) ?? sessionEndedNotice(account);
  const resumableItems = useMemo(
    () =>
      resumable.flatMap((entry) => {
        if (!entry.media || !belongsInContinueWatching(entry.media)) return [];
        if (!unavailable) return [entry.media];
        const stored = localCopyOf(downloads, entry.media);
        return stored ? [offlineMedia(stored)] : [];
      }),
    [resumable, unavailable, downloads],
  );
  const resumableShown = useCurrentAvailability(resumableItems);

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
        <View style={styles.headerActions}>
          <AccountMarker />
          <HeaderButton label="Settings" onPress={() => router.navigate('/settings')}>
            <SettingsIcon size={20} />
          </HeaderButton>
        </View>
      }>
      {accountNotice ? (
        <Notice title={accountNotice.title} detail={accountNotice.detail} onPress={() => router.navigate('/login')} />
      ) : null}
      {!home.value && home.loading ? <Loading /> : null}
      {!home.value && home.error ? <ErrorState error={home.error} onRetry={home.refresh} /> : null}
      {home.value && home.error ? <InlineError message={refreshFailureMessage(home.error)} /> : null}

      {home.value ? (
        <>
          {resumableShown.length > 0 ? (
            <MediaRow
              title="Continue watching"
              items={resumableShown}
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
            emptyLabel={describeEmptyLibrary('films', problems).title}
          />
          <MediaRow
            title="TV"
            items={newestCatalogueFirst(home.value.shows).slice(0, RAIL_LIMIT)}
            onOpen={openMedia}
            onSeeAll={() => router.navigate('/shows')}
            emptyLabel={describeEmptyLibrary('series', problems).title}
          />
          <MediaRow
            title="Music"
            items={newestCatalogueFirst(home.value.albums).slice(0, RAIL_LIMIT)}
            onOpen={openMedia}
            onSeeAll={() => router.navigate('/music')}
            emptyLabel={describeEmptyLibrary('albums', problems).title}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Beside Settings rather than replacing it: identity is not a destination.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
