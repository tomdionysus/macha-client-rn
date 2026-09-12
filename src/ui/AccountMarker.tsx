import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '../providers/MachaProvider';
import { UserIcon } from './Icons';
import { colors, radius, type as typography, TOUCH_TARGET } from './theme';

/**
 * Who you are, stated as quietly as the question deserves.
 *
 * It renders nothing at all unless the cluster has actually named a user or
 * named the anonymous account. The two silent cases are deliberate: an
 * unanswered whoami (offline, starting, or a node too old to have accounts)
 * would otherwise be drawn as "nobody is signed in", which is a claim this
 * client has no answer to make. A marker that appears a moment late is a
 * smaller fault than one that is confidently wrong.
 *
 * A letter rather than a picture, because Macha has no avatars — core models
 * a username and nothing else, and inventing an image here would be inventing
 * a field the server does not have.
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
      // Signed in, the account lives in Settings beside everything else about
      // this device. Anonymous, the only useful move is the one control the
      // viewer came for.
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
  // A full touch target around a much smaller mark: the disc is the subtle
  // part, the 44pt box is what a thumb actually has to hit.
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
  // Only a signed-in marker carries a disc. Anonymous is a glyph on the same
  // footing as the other header buttons, because it is one.
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
