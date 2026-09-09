import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERVER_UNREACHABLE_MESSAGE } from '../api/errors';
import { coerceEndpointUrl, fetchWithTimeout } from '../api/http';
import { useMacha } from '../providers/MachaProvider';
import { Button } from '../ui/controls';
import { MachaLogo } from '../ui/Logo';
import { colors, radius, space, type as typography } from '../ui/theme';

const CONNECTION_CHECK_TIMEOUT_MS = 6_000;

/**
 * The connection gate. Macha has no accounts and no cloud directory, so the
 * only thing the client needs is the address of one node — everything else
 * (session, cluster membership, catalogue) follows from that.
 */
export default function ConnectScreen() {
  const { configure, endpoints } = useMacha();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [address, setAddress] = useState(endpoints.join('\n'));
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const connect = useCallback(async () => {
    const candidates = address
      .split(/[\n,]/)
      .map((entry) => coerceEndpointUrl(entry))
      .filter(Boolean);

    if (candidates.length === 0) {
      setMessage('Enter the address of a Macha node, for example 192.168.1.20:7438');
      return;
    }

    setChecking(true);
    setMessage(undefined);
    try {
      const reachable = await firstReachable(candidates);
      if (!reachable) {
        setMessage(SERVER_UNREACHABLE_MESSAGE);
        return;
      }
      // The reachable node goes first so the very next request starts on a node
      // already known to answer, rather than retrying a dead seed.
      configure([reachable, ...candidates.filter((candidate) => candidate !== reachable)]);
      router.replace('/');
    } finally {
      setChecking(false);
    }
  }, [address, configure, router]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <MachaLogo size={96} opacity={0.9} style={styles.logo} />
        <Text style={styles.title}>Macha</Text>
        <Text style={styles.lede}>
          Your own media, on your own machines. Enter the address of any node in your cluster — the rest of the
          cluster is discovered from there.
        </Text>

        <Text style={styles.label}>Node address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.20:7438"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Text style={styles.hint}>One per line to seed more than one node. Plain HTTP on port 7438 is assumed.</Text>

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Button label="Connect" onPress={() => void connect()} busy={checking} style={styles.connect} />
        {endpoints.length > 0 ? (
          <Button label="Cancel" variant="quiet" onPress={() => router.back()} style={styles.cancel} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The first candidate that answers `catalogue/status`. Every candidate is
 * probed at once rather than in series: on a LAN, a wrong address usually hangs
 * until its deadline, and making the viewer wait through each one in turn is
 * the difference between "instant" and "seems broken".
 */
async function firstReachable(candidates: readonly string[]): Promise<string | undefined> {
  const probes = candidates.map(async (baseUrl) => {
    const response = await fetchWithTimeout(
      (url, init) => fetch(url, init),
      `${baseUrl}/api/v1/catalogue/status`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      CONNECTION_CHECK_TIMEOUT_MS,
    );
    // Unauthenticated on purpose: this probe runs before any session exists,
    // and 401 still proves a Macha node is listening. The session the app then
    // mints is what carries authorization from here on.
    if (!response.ok && response.status !== 401) throw new Error(`${response.status}`);
    return baseUrl;
  });

  const results = await Promise.allSettled(probes);
  return results.find((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')?.value;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.xl,
  },
  logo: {
    alignSelf: 'center',
  },
  title: {
    ...typography.display,
    fontSize: 30,
    color: colors.text,
    textAlign: 'center',
    marginTop: space.md,
  },
  lede: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.xxl,
    lineHeight: 21,
  },
  label: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.sm,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 50,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  hint: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  error: {
    ...typography.body,
    color: colors.danger,
    marginBottom: space.lg,
  },
  connect: {
    marginTop: space.sm,
  },
  cancel: {
    marginTop: space.md,
  },
});
