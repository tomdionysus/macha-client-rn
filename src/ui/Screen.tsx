import { useRouter } from 'expo-router';
import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertIcon, ChevronLeftIcon } from './Icons';
import { useConnectivity } from '../providers/MachaProvider';
import { Watermark } from './Logo';
import { useBottomChromeInset } from './chrome';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

interface ScreenProps {
  title?: string;
  /** Small line above the title — the parent series, artist, or section. */
  eyebrow?: string;
  showBack?: boolean;
  /** Rendered before the title — the Macha mark on top-level screens. */
  leading?: React.ReactNode;
  headerRight?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Standard screen chrome: safe-area handling, a compact header that leaves the
 * maximum amount of a phone screen for content, the Macha watermark, and
 * bottom padding that clears the docked navigation and mini player.
 */
export function Screen({
  title,
  eyebrow,
  showBack = false,
  leading,
  headerRight,
  onRefresh,
  refreshing = false,
  scrollable = true,
  contentStyle,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomChromeInset();
  const router = useRouter();
  const { offline } = useConnectivity();

  const header =
    title || showBack || leading || headerRight ? (
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <ChevronLeftIcon size={22} color={colors.text} />
          </Pressable>
        ) : null}
        {leading}
        <View style={styles.headerText}>
          {eyebrow ? (
            <Text numberOfLines={1} style={styles.eyebrow}>
              {eyebrow.toUpperCase()}
            </Text>
          ) : null}
          {title ? (
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : null}
        </View>
        {offline ? <OfflineBadge onPress={() => router.navigate('/downloads')} /> : null}
        {headerRight}
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );

  const notice = offline ? <OfflineNotice /> : null;

  const body = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[{ paddingBottom: bottomInset }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textDim} colors={[colors.progress]} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <Watermark />
      {header}
      {notice}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    ...typography.micro,
    color: colors.textFaint,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  backButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    marginLeft: -space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});

/**
 * The offline indicator: a warning triangle beside the screen's own action.
 *
 * Deliberately small and non-blocking. Being off the network is a state the
 * app carries on working in, not a failure to interrupt someone with.
 */
function OfflineBadge({ onPress }: { onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Macha is offline. Showing downloaded media."
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [offlineStyles.badge, pressed && offlineStyles.pressed]}>
      <AlertIcon size={20} color={colors.danger} />
    </Pressable>
  );
}

/** One quiet line explaining why the library looks smaller than usual. */
function OfflineNotice() {
  return (
    <View style={offlineStyles.notice}>
      <Text style={offlineStyles.noticeText}>Macha is offline. Showing downloaded media.</Text>
    </View>
  );
}

const offlineStyles = StyleSheet.create({
  badge: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  notice: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textFaint,
  },
});

/** A round header action, sized for a thumb rather than a cursor. */
export function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [headerButtonStyles.button, pressed && headerButtonStyles.pressed]}>
      {children}
    </Pressable>
  );
}

const headerButtonStyles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
});
