import { Redirect } from 'expo-router';
import { usePlayback } from '../providers/PlaybackProvider';

/** Fallback for unmatched links: the player while something is playing, otherwise Home. */
export default function NotFound() {
  const { status } = usePlayback();
  return <Redirect href={status === 'idle' ? '/' : '/play'} />;
}
