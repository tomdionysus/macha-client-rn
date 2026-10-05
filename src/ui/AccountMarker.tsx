import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '../providers/MachaProvider';
import { UserIcon } from './Icons';
import { colors, radius, type as typography, TOUCH_TARGET } from './theme';

/**
 * Header account marker: the user's initial (Macha has no avatars), or a glyph
 * when anonymous. Renders nothing until the cluster has answered whoami, so an
 * unanswered call is never drawn as "signed out".
 */
export function AccountMarker() {
  const router = useRouter();
  const { display } = useAccount();

  if (display.kind === 'unknown' || display.kind === 'unstated') return null;

  const signedIn = display.kind === 'signedIn';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={signedIn ? `Signed in as ${display.username}` : 'Log in'}
      hitSlop={8}
      onPress={() => router.navigate(signedIn ? '/settings' : '/login')}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}>
      <View style={[styles.disc, signedIn && styles.identified]}>
        {signedIn ? (
          <Text style={styles.initial} numberOfLines={1}>
            {display.initial}
          </Text>
        ) : (
          <UserIcon size={18} color={colors.textFaint} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Full touch target around a smaller disc.
  target: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Only signed-in gets a disc; anonymous matches the other header buttons.
  identified: {
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  initial: {
    ...typography.label,
    color: colors.text,
  },
  pressed: {
    opacity: 0.6,
  },
});
