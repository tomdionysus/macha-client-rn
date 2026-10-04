import { useMemo } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { MediaSummary } from '../types';
import { useAsync } from './useAsync';

/**
 * Stored titles (Continue Watching, queue, playlists) with live availability
 * from the catalogue, since stores never keep it. Until answered, or if missed,
 * a title shows no marker and stays playable.
 */
export function useCurrentAvailability<T extends MediaSummary>(items: readonly T[]): T[] {
  const { media, generation } = useMacha();
  const key = items.map((item) => item.id).join('\n');
  const current = useAsync(
    (signal) => media.currentAvailability([...new Set(items.map((item) => item.id))], signal),
    [media, generation, key],
  );
  return useMemo(() => {
    const found = current.value;
    if (!found || found.size === 0) return [...items];
    return items.map((item) => {
      const fresh = found.get(item.id);
      return fresh ? { ...item, ...fresh } : item;
    });
  }, [items, current.value]);
}
