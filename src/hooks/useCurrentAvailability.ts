import { useMemo } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { MediaSummary } from '../types';
import { useAsync } from './useAsync';

/**
 * Stored titles with their availability as it stands now. No store keeps it,
 * so a stored `unavailable` cannot lock a title after its node comes back;
 * Continue Watching, the queue and playlists ask the catalogue instead, once
 * per change of the list. Until the answer, and for a title it misses, the
 * title shows no marker and stays playable.
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
