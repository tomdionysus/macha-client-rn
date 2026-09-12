import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import React, { useCallback, useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './controls';
import { colors, radius, space, type as typography } from './theme';

/**
 * How long the same payload is ignored after it has been handed over.
 *
 * `onBarcodeScanned` fires per frame while a code is in view, so a code held
 * steady for a second arrives dozens of times. A one-shot latch would be
 * simpler, but it also ends the scan: when a code turns out to be the wrong
 * one, the viewer's next move is to point the camera at a different code, and
 * a latched scanner would sit there dead while they did it. Deduplicating on
 * the payload instead means a repeat is quiet and a different code is instant.
 */
const REPEAT_INTERVAL_MS = 2_000;

interface QrScannerProps {
  /** The raw payload of each newly seen code. Interpreting it is the caller's. */
  onScan(data: string): void;
  onCancel(): void;
  instruction: string;
  /** Shown under the viewfinder — a rejected code, usually. */
  message?: string;
}

/**
 * The camera, a viewfinder and nothing else. It reports payloads and holds no
 * opinion about what they mean: the connect screen reads node addresses out of
 * them, and whatever pairs a user to this client will read something else.
 */
export function QrScanner({ onScan, onCancel, instruction, message }: QrScannerProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const lastSeen = useRef<{ data: string; at: number }>({ data: '', at: 0 });

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      const now = Date.now();
      if (result.data === lastSeen.current.data && now - lastSeen.current.at < REPEAT_INTERVAL_MS) return;
      lastSeen.current = { data: result.data, at: now };
      onScan(result.data);
    },
    [onScan],
  );

  // Null means the permission state has not been read back yet, which is a
  // frame or two at startup. Rendering the prompt through it would flash a
  // request at someone who has already granted it.
  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.prompt, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
        <Text style={styles.promptTitle}>Camera access</Text>
        <Text style={styles.promptBody}>
          {permission.canAskAgain
            ? 'Scanning a code needs the camera. Nothing is recorded, and no image leaves the phone.'
            : 'The camera is switched off for Macha. Turn it back on in Settings to scan a code.'}
        </Text>
        <Button
          label={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
          onPress={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          style={styles.promptAction}
        />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScan}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} pointerEvents="box-none">
        <Text style={styles.instruction}>{instruction}</Text>
        <View style={styles.viewfinder} />
        <View style={styles.footer} pointerEvents="box-none">
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  prompt: {
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  promptTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  promptBody: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: space.lg,
  },
  promptAction: {
    marginTop: space.sm,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  instruction: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.scrim,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // A plain square rather than a mask: the scanner reads the whole frame, so a
  // cut-out implying otherwise would be telling the viewer something untrue.
  viewfinder: {
    width: 232,
    height: 232,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  footer: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: space.md,
  },
  message: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
    backgroundColor: colors.scrim,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
