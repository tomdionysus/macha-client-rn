import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAccount, useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import { useAsync } from '../hooks/useAsync';
import { signOutFailureMessage } from '../api/failureMessages';
import { ChevronRightIcon, DownloadIcon, ServerIcon, TrashIcon, UserIcon } from '../ui/Icons';
import { useDownloads } from '../hooks/useDownloads';
import { formatBytes, pluralize } from '../ui/format';
import { Screen } from '../ui/Screen';
import { Divider, ListRow, Tag } from '../ui/controls';
import { colors, space, type as typography } from '../ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { media, endpoints, registry, continueWatching, queue, generation, signOut } = useMacha();
  const { display: account, session } = useAccount();
  // Core's registry reports through `snapshot()`; there is no `all` accessor.
  const knownEndpoints = registry.snapshot().length;
  const { stop } = usePlayback();
  const [cleared, setCleared] = useState(false);
  const { complete: downloaded, storedBytes } = useDownloads();

  const catalogue = useAsync((signal) => media.status(signal), [media, generation]);

  const forget = useCallback(() => {
    Alert.alert(
      'Clear local history',
      'This removes Continue Watching and the saved play queue from this device. Nothing on your Macha nodes changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void stop();
            continueWatching.clearAll();
            queue.clear();
            setCleared(true);
          },
        },
      ],
    );
  }, [continueWatching, queue, stop]);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | undefined>(undefined);

  const logOut = useCallback(() => {
    Alert.alert(
      'Log out?',
      'This ends the session everywhere, not just on this device, and anything playing will stop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSigningOut(true);
              setSignOutError(undefined);
              try {
                // Playback stops first: after the token changes, a session
                // created under the old identity can no longer be closed, and
                // the node holds it against `max_video_transcodes` for thirty
                // minutes. The same reason the login screen stops first.
                await stop();
                await signOut();
              } catch (error) {
                // Signing out locally has already happened by the time this
                // throws — what failed is the revoke, so the honest thing to
                // report is that the old session is still live elsewhere.
                setSignOutError(signOutFailureMessage(error));
              } finally {
                setSigningOut(false);
              }
            })();
          },
        },
      ],
    );
  }, [signOut, stop]);

  return (
    <Screen title="Settings" showBack onRefresh={catalogue.refresh} refreshing={catalogue.refreshing}>
      <Section title="Connection">
        <ListRow
          title="Macha nodes"
          // Every configured node, one per line, rather than the first two and
          // a nothing. A seed list is a list: showing part of it invites the
          // reading that only that many are allowed, and the whole point of
          // seeding more than one is that the cluster survives losing a node.
          detail={endpoints.length > 0 ? endpoints.join('\n') : 'Not configured'}
          detailLines={Math.max(endpoints.length, 1)}
          leading={<ServerIcon size={20} color={colors.textDim} />}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/connect')}
        />
        <Divider />
        <ListRow
          title="Cluster status"
          detail={`${knownEndpoints} known endpoint${knownEndpoints === 1 ? '' : 's'}`}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/status')}
        />
      </Section>

      {account.kind === 'unstated' ? null : (
        <Section title="Account">
          {account.kind === 'signedIn' ? (
            <ListRow
              title={account.username}
              // The server's own role names, unprettified. It named what it
              // granted, and a client that renames or groups them is inventing
              // policy — a role this build does not recognise still shows.
              detail={session?.roles.length ? session.roles.join(' · ') : 'No roles granted'}
              leading={<UserIcon size={20} color={colors.textDim} />}
            />
          ) : null}
          {account.kind === 'anonymous' ? (
            <ListRow
              title="Log in"
              detail="Browsing as a guest. Signing in reaches everything your account allows."
              leading={<UserIcon size={20} color={colors.textDim} />}
              trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
              onPress={() => router.navigate('/login')}
            />
          ) : null}
          {account.kind === 'unknown' ? (
            <Text style={styles.pending}>The cluster has not said who this session belongs to.</Text>
          ) : null}
          {account.kind === 'signedIn' ? (
            <>
              <Divider />
              <ListRow
                title={signingOut ? 'Logging out…' : 'Log out'}
                detail="Ends this session on every node, not just here."
                leading={<UserIcon size={20} color={colors.danger} />}
                onPress={signingOut ? undefined : logOut}
              />
            </>
          ) : null}
          {signOutError ? (
            <Text style={styles.error}>{signOutError}</Text>
          ) : null}
        </Section>
      )}

      <Section title="Catalogue">
        {catalogue.value ? (
          <View style={styles.facts}>
            <View style={styles.tags}>
              <Tag label={catalogue.value.ready ? 'Ready' : 'Indexing'} tone={catalogue.value.ready ? 'accent' : 'neutral'} />
              <Tag label={`${catalogue.value.items} items`} />
              <Tag label={`${catalogue.value.artwork_objects} artwork`} />
            </View>
            {catalogue.value.error ? <Text style={styles.error}>{catalogue.value.error}</Text> : null}
          </View>
        ) : (
          <Text style={styles.pending}>
            {catalogue.error ? 'The node did not report catalogue status.' : 'Reading catalogue status…'}
          </Text>
        )}
      </Section>

      <Section title="Offline">
        <ListRow
          title="Downloads"
          detail={
            downloaded.length > 0
              ? `${pluralize(downloaded.length, 'item')} · ${formatBytes(storedBytes)} stored`
              : 'Nothing downloaded yet'
          }
          leading={<DownloadIcon size={20} color={colors.textDim} />}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/downloads')}
        />
      </Section>

      <Section title="This device">
        <ListRow
          title="Clear local history"
          detail={
            cleared
              ? 'Cleared.'
              : 'Continue Watching and the play queue live only on this device. They are never sent to Macha.'
          }
          leading={<TrashIcon size={20} color={colors.danger} />}
          onPress={forget}
        />
      </Section>

      <Text style={styles.colophon}>
        Macha client {Constants.expoConfig?.version ?? ''}
        {'\n'}No cloud, no telemetry.
      </Text>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: space.xxl,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  facts: {
    paddingHorizontal: space.lg,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: space.sm,
  },
  pending: {
    ...typography.caption,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
  },
  colophon: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: space.lg,
  },
});
