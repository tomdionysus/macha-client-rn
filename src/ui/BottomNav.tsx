import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilmIcon, HomeIcon, MusicIcon, SearchIcon, TvIcon, type IconProps } from './Icons';
import { BOTTOM_NAV_HEIGHT } from './chrome';
import { colors, radius, space, type as typography } from './theme';

interface Destination {
  href: string;
  label: string;
  Icon: React.ComponentType<IconProps>;
  /** Route prefixes that belong to this destination, for the active highlight. */
  owns: string[];
}

const DESTINATIONS: Destination[] = [
  { href: '/', label: 'Home', Icon: HomeIcon, owns: [] },
  { href: '/movies', label: 'Films', Icon: FilmIcon, owns: ['/movies'] },
  { href: '/shows', label: 'TV', Icon: TvIcon, owns: ['/shows', '/seasons', '/episodes'] },
  { href: '/music', label: 'Music', Icon: MusicIcon, owns: ['/music'] },
  { href: '/search', label: 'Search', Icon: SearchIcon, owns: ['/search'] },
];

/**
 * The primary navigation, docked at the bottom where a thumb reaches. It sits
 * above the safe-area inset rather than inside it, so the gesture bar never
 * overlaps a target.
 */
export function BottomNav() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: BOTTOM_NAV_HEIGHT + insets.bottom }]}>
      {DESTINATIONS.map(({ href, label, Icon, owns }) => {
        const active = href === '/' ? pathname === '/' : owns.some((prefix) => pathname.startsWith(prefix));
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => router.navigate(href as never)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={[styles.iconWell, active && styles.iconWellActive]}>
              <Icon size={21} color={active ? colors.text : colors.textFaint} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundLift,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingTop: space.sm,
    gap: 2,
  },
  pressed: {
    opacity: 0.65,
  },
  iconWell: {
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  iconWellActive: {
    backgroundColor: colors.accentSurfaceStrong,
  },
  label: {
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.2,
    color: colors.textFaint,
  },
  labelActive: {
    color: colors.text,
  },
});
