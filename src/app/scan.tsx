import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { readScannedEndpoint } from '../scan/endpoint';
import { QrScanner } from '../ui/QrScanner';

/** Scans a node address into the connect screen; `QrScanner` reads codes, this screen interprets them. */
export default function ScanScreen() {
  const router = useRouter();
  const [message, setMessage] = useState<string | undefined>(undefined);

  const handleScan = useCallback(
    (data: string) => {
      const endpoint = readScannedEndpoint(data);
      if (!endpoint) {
        // Haptic as well as text: the screen does not move, and a phone at arm's
        // length is not read closely.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setMessage('That code is not a node address.');
        return;
      }
      // Only pushed from /connect, so dismissing returns there with the address
      // filled in. The fallback covers the `macha://scan` deep link, which has
      // nothing beneath it.
      const target = { pathname: '/connect', params: { scanned: endpoint } } as const;
      if (router.canDismiss()) router.dismissTo(target);
      else router.replace(target);
    },
    [router],
  );

  return (
    <QrScanner
      onScan={handleScan}
      onCancel={() => (router.canGoBack() ? router.back() : router.replace('/connect'))}
      instruction="Point the camera at the code shown by your Macha node."
      message={message}
    />
  );
}
