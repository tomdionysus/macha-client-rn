import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './controls';
import { colors, radius, space, type as typography } from './theme';

/**
 * How long a repeated payload is ignored. `onBarcodeScanned` fires every frame;
 * deduplicating by payload rather than latching lets a different code through at once.
 */
const REPEAT_INTERVAL_MS = 2_000;

interface QrScannerProps {
  /** The raw payload of each newly seen code. Interpreting it is the caller's. */
  onScan(data: string): void;
  onCancel(): void;
  instruction: string;
  /** Shown under the viewfinder, usually a rejected code. */
  message?: string;
}

/** Camera and viewfinder that reports raw QR payloads; callers interpret them. */
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

  // Permission not read yet; avoid flashing the prompt at someone who granted it.
  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.prompt, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
        <Text style={styles.promptTitle}>Camera access</Text>
        <Text style={styles.promptBody}>
          {permission.canAskAgain
            ? 'Scanning a code needs the camera. Nothing is recorded, and no image leaves this device.'
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
  // A plain square, not a mask: the scanner reads the whole frame.
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
