import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '../providers/PlaybackProvider';
import { space } from './theme';

export const BOTTOM_NAV_HEIGHT = 58;
export const MINI_PLAYER_HEIGHT = 62;

/**
 * How much room the docked chrome takes at the bottom of the window. Screens
 * add this to their scroll padding so the last row of content is never left
 * under the navigation bar or the mini player.
 */
export function useBottomChromeInset(): number {
  const insets = useSafeAreaInsets();
  const { status } = usePlayback();
  const miniPlayer = status === 'idle' ? 0 : MINI_PLAYER_HEIGHT;
  return insets.bottom + BOTTOM_NAV_HEIGHT + miniPlayer + space.md;
}
