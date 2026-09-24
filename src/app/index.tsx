import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { newestCatalogueFirst } from '../api/media';
import { useAsync } from '../hooks/useAsync';
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
import { sessionExpiryNotice } from '../account/expiry';

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
    () => new Map(resumable.map((entry) => [entry.mediaId, entry])),
    [resumable],
  );
  /**
   * Continue watching, narrowed to what can actually be played right now.
   *
   * Progress is device-local, so the list survives the cluster going away and
   * would otherwise keep offering items whose bytes are somewhere this device
   * cannot reach — an offer that can only fail. Restricted to downloads
   * whenever cluster media is out of reach, with each entry swapped for its
   * stored form so the cover comes off the disk rather than from a node.
   *
   * **Not keyed on "offline".** That was one of four ways the answer is no, and
   * the other three left unplayable items on the rail: a cluster that refuses
   * this viewer answers every request promptly and is not offline by any
   * measure, yet can play them nothing. `clusterMediaUnavailable` asks the
   * question this rail actually has, which is not about the network.
   */
  const unavailable = clusterMediaUnavailable(problems);
  // Read against the clock at render, with no timer. The window is days wide,
  // so the banner appearing at Home's next render (a refresh, a return to the
  // screen, an account change) is soon enough. It goes as soon as a login
  // replaces the session.
  const expiry = sessionExpiryNotice(account, Date.now());
  const resumableItems = useMemo(
    () =>
      resumable.flatMap((entry) => {
        if (!entry.media) return [];
        if (!unavailable) return [entry.media];
        const stored = localCopyOf(downloads, entry.media);
        return stored ? [offlineMedia(stored)] : [];
      }),
    [resumable, unavailable, downloads],
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
        <View style={styles.headerActions}>
          <AccountMarker />
          <HeaderButton label="Settings" onPress={() => router.navigate('/settings')}>
            <SettingsIcon size={20} />
          </HeaderButton>
        </View>
      }>
      {expiry ? <Notice title={expiry.title} detail={expiry.detail} onPress={() => router.navigate('/login')} /> : null}
      {!home.value && home.loading ? <Loading /> : null}
      {!home.value && home.error ? <ErrorState error={home.error} onRetry={home.refresh} /> : null}
      {home.value && home.error ? <InlineError message={refreshFailureMessage(home.error)} /> : null}

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
  // The marker sits before Settings rather than replacing it: identity is not
  // a destination, and on every screen but Settings it is not what the viewer
  // came for.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
