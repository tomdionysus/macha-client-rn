import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkEndpointConfiguration } from '@machafoundation/core';
import { coerceEndpointUrl } from '../api/http';
import { useMacha } from '../providers/MachaProvider';
import {
  addRow,
  adoptEndpoint,
  connectOutcome,
  editRow,
  NO_ENDPOINT_MESSAGE,
  removeRow,
  splitEndpointEntries,
} from '../state/endpointList';
import { Button } from '../ui/controls';
import { CloseIcon, PlusIcon, ScanIcon } from '../ui/Icons';
import { MachaLogo } from '../ui/Logo';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../ui/theme';

/**
 * The connection gate. Macha has no accounts and no cloud directory, so the
 * only thing the client needs is the address of one node — everything else
 * (session, cluster membership, catalogue) follows from that.
 */
export default function ConnectScreen() {
  const { configure, endpoints } = useMacha();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanned } = useLocalSearchParams<{ scanned?: string }>();

  const [rows, setRows] = useState<string[]>(endpoints.length > 0 ? [...endpoints] : ['']);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  // The addresses the viewer has already been warned did not identify
  // themselves as Macha. A second tap on the same list saves it anyway.
  const warnedFor = useRef<string | undefined>(undefined);

  // A scanned address takes the empty row a fresh screen starts with, or adds
  // one of its own, rather than replacing what is already there — someone who
  // has typed a seed has not asked for it to be thrown away. It is not
  // connected with automatically either: an address that arrived from a camera
  // is worth seeing before it is used.
  const applied = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!scanned || applied.current === scanned) return;
    applied.current = scanned;
    setMessage(undefined);
    setRows((current) => adoptEndpoint(current, scanned));
  }, [scanned]);

  const connect = useCallback(async () => {
    const candidates = rows
      .flatMap((row) => splitEndpointEntries(row))
      .map((entry) => coerceEndpointUrl(entry))
      .filter(Boolean);

    if (candidates.length === 0) {
      setMessage(NO_ENDPOINT_MESSAGE);
      return;
    }

    setChecking(true);
    setMessage(undefined);
    try {
      // Core's pre-save check, on core's liveness route: every address at once,
      // unauthenticated, behind a UI deadline that does not abort the request.
      const key = candidates.join('\n');
      const outcome = connectOutcome(await checkEndpointConfiguration(candidates), warnedFor.current === key);
      if (outcome.kind !== 'save') {
        warnedFor.current = outcome.kind === 'confirm' ? key : undefined;
        setMessage(outcome.message);
        return;
      }
      configure(outcome.endpoints);
      router.replace('/');
    } finally {
      setChecking(false);
    }
  }, [configure, rows, router]);

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

        <Text style={styles.label}>{rows.length > 1 ? 'Node addresses' : 'Node address'}</Text>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            <TextInput
              value={row}
              onChangeText={(value) => setRows((current) => editRow(current, index, value))}
              placeholder="192.168.1.20:7438"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
              style={[styles.input, styles.rowInput]}
            />
            {rows.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove node ${index + 1}`}
                hitSlop={8}
                onPress={() => setRows((current) => removeRow(current, index))}
                style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}>
                <CloseIcon size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        ))}

        <Button
          label="Add another node"
          variant="quiet"
          icon={<PlusIcon size={16} color={colors.textDim} />}
          onPress={() => setRows((current) => addRow(current))}
          style={styles.add}
        />
        <Text style={styles.hint}>
          Seed as many nodes as you like — the rest of the cluster is discovered from whichever answers first.
          Pasting a list into any field spreads it across fields. Plain HTTP on port 7438 is assumed.
        </Text>

        <Button
          label="Scan a code"
          variant="secondary"
          icon={<ScanIcon size={18} />}
          onPress={() => router.push('/scan')}
          style={styles.scan}
        />

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Button label="Connect" onPress={() => void connect()} busy={checking} style={styles.connect} />
        {endpoints.length > 0 ? (
          <Button label="Cancel" variant="quiet" onPress={() => router.back()} style={styles.cancel} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  rowInput: {
    flex: 1,
  },
  remove: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: {
    opacity: 0.6,
  },
  add: {
    alignSelf: 'flex-start',
    marginBottom: space.md,
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
  scan: {
    marginBottom: space.lg,
  },
  connect: {
    marginTop: space.sm,
  },
  cancel: {
    marginTop: space.md,
  },
});
