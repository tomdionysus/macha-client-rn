import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import { useAsync } from '../hooks/useAsync';
import { ChevronRightIcon, ServerIcon, TrashIcon } from '../ui/Icons';
import { Screen } from '../ui/Screen';
import { Divider, ListRow, Tag } from '../ui/controls';
import { colors, space, type as typography } from '../ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { media, endpoints, apiToken, registry, continueWatching, queue, generation } = useMacha();
  const { stop } = usePlayback();
  const [cleared, setCleared] = useState(false);

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

  return (
    <Screen title="Settings" showBack onRefresh={catalogue.refresh} refreshing={catalogue.refreshing}>
      <Section title="Connection">
        <ListRow
          title="Macha nodes"
          detail={endpoints.length > 0 ? endpoints.join('\n') : 'Not configured'}
          leading={<ServerIcon size={20} color={colors.textDim} />}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/connect')}
        />
        <Divider />
        <ListRow
          title="API token"
          detail={apiToken ? 'A manual bearer token is configured' : 'Using anonymous node sessions'}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/connect')}
        />
        <Divider />
        <ListRow
          title="Cluster status"
          detail={`${registry.all.length} known endpoint${registry.all.length === 1 ? '' : 's'}`}
          trailing={<ChevronRightIcon size={18} color={colors.textFaint} />}
          onPress={() => router.navigate('/status')}
        />
      </Section>

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
        {'\n'}No accounts, no cloud, no telemetry.
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
