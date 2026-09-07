import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { MediaSummary } from '../types';

/** Where a catalogue item lives in the route tree. Tracks have no page of their own — they play. */
export function hrefForMedia(item: MediaSummary): string | undefined {
  switch (item.kind) {
    case 'movie':
      return `/movies/${encodeURIComponent(item.id)}`;
    case 'show':
      return `/shows/${encodeURIComponent(item.id)}`;
    case 'season':
      return `/seasons/${encodeURIComponent(item.id)}`;
    case 'episode':
      return `/episodes/${encodeURIComponent(item.id)}`;
    case 'artist':
      return `/music/artists/${encodeURIComponent(item.id)}`;
    case 'album':
      return `/music/albums/${encodeURIComponent(item.id)}`;
    default:
      return undefined;
  }
}

export function useOpenMedia(): (item: MediaSummary) => void {
  const router = useRouter();
  return useCallback(
    (item: MediaSummary) => {
      const href = hrefForMedia(item);
      if (href) router.navigate(href as never);
    },
    [router],
  );
}
