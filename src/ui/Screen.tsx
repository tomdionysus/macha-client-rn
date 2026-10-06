import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { useProblems } from '../providers/MachaProvider';
import type { Problem } from '../state/problems';
import { Sheet } from './Sheet';
import { Watermark } from './Logo';
import { useBottomChromeInset } from './chrome';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

interface ScreenProps {
  title?: string;
  /** Small line above the title: the parent series, artist, or section. */
  eyebrow?: string;
  showBack?: boolean;
  /** Rendered before the title: the Macha mark on top-level screens. */
  leading?: React.ReactNode;
  headerRight?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Standard screen chrome: safe areas, a compact header, the watermark, problem
 * reporting, and bottom padding that clears the docked navigation and mini player.
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
  const problems = useProblems();
  const [explaining, setExplaining] = useState(false);

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
        {problems.length > 0 ? <ProblemBadge problems={problems} onPress={() => setExplaining(true)} /> : null}
        {headerRight}
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );

  const notice = problems.length > 0 ? <ProblemNotice problem={problems[0]} /> : null;

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
      <ProblemSheet problems={problems} visible={explaining} onClose={() => setExplaining(false)} />
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
 * The app's one warning: a small, non-blocking header triangle for any current
 * problem (not only offline). Tapping it explains.
 */
function ProblemBadge({ problems, onPress }: { problems: readonly Problem[]; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      // Announce the problem itself, not just "warning".
      accessibilityLabel={`${problems.map((problem) => problem.title).join('. ')}. Tap for detail.`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [problemStyles.badge, pressed && problemStyles.pressed]}>
      <AlertIcon size={20} color={colors.danger} />
    </Pressable>
  );
}

/** One line under the header naming the first problem; `describeProblems` orders them by impact. */
function ProblemNotice({ problem }: { problem: Problem }) {
  return (
    <View style={problemStyles.notice}>
      <Text style={problemStyles.noticeText}>{problem.title}</Text>
    </View>
  );
}

/** What is wrong, in full, and what still works despite it. */
function ProblemSheet({
  problems,
  visible,
  onClose,
}: {
  problems: readonly Problem[];
  visible: boolean;
  onClose(): void;
}) {
  // Closes itself when every problem clears.
  if (problems.length === 0) return null;

  return (
    <Sheet visible={visible} title={problems.length > 1 ? "What's wrong" : problems[0].title} onClose={onClose}>
      {problems.map((problem) => (
        <View key={problem.kind} style={problemStyles.explanation}>
          {problems.length > 1 ? <Text style={problemStyles.explanationTitle}>{problem.title}</Text> : null}
          <Text style={problemStyles.explanationDetail}>{problem.detail}</Text>
        </View>
      ))}
    </Sheet>
  );
}

const problemStyles = StyleSheet.create({
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
  explanation: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  explanationTitle: {
    ...typography.label,
    color: colors.text,
  },
  explanationDetail: {
    ...typography.body,
    color: colors.textDim,
  },
});

/** A round header action button. */
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
