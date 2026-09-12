import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { readScannedEndpoint } from '../scan/endpoint';
import { QrScanner } from '../ui/QrScanner';

/**
 * Scanning a node address into the connect screen.
 *
 * The camera itself is `QrScanner`, which reports payloads and interprets
 * none of them. This screen supplies the interpretation — a Macha node address
 * — and is the only thing that would need writing again for a code that means
 * something else.
 */
export default function ScanScreen() {
  const router = useRouter();
  const [message, setMessage] = useState<string | undefined>(undefined);

  const handleScan = useCallback(
    (data: string) => {
      const endpoint = readScannedEndpoint(data);
      if (!endpoint) {
        // The only feedback available for a refusal: the screen does not move,
        // and a phone held at arm's length is not being read closely.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setMessage('That code is not a node address.');
        return;
      }
      // Only ever pushed from /connect, so dismissing returns the viewer to the
      // screen they left with the address filled in. The fallback is for the
      // deep link — `macha://scan` opens this route with nothing beneath it.
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
