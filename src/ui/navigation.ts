import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { MediaSummary } from '../types';

/** Where a catalogue item lives in the route tree. Tracks have no page of their own — they play. */
export function hrefForMedia(item: MediaSummary): string | undefined {
  return hrefFor(item.kind, item.id);
}

/**
 * The same, from a kind and an id — for a link to an item this screen holds
 * only a reference to, such as an episode's series or season.
 */
export function hrefFor(kind: MediaSummary['kind'], id: string): string | undefined {
  const item = { kind, id };
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
