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
 * The one warning in the app: a triangle beside the screen's own actions.
 *
 * Deliberately small and non-blocking. Every state it stands for is one the app
 * carries on working in — the viewer's own downloads play throughout — so this
 * is a thing to notice, not a thing to be interrupted by.
 *
 * It used to mean "offline" and only that. It now stands for whatever is
 * actually wrong, because a viewer does not care which of four internal facts
 * produced a smaller library; they care what it is and whether it is theirs to
 * fix. Tapping it says so.
 */
function ProblemBadge({ problems, onPress }: { problems: readonly Problem[]; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      // The label carries the problem itself: a screen reader announcing
      // "warning, button" has told somebody there is a problem and refused to
      // say what, which is worse than not marking it at all.
      accessibilityLabel={`${problems.map((problem) => problem.title).join('. ')}. Tap for detail.`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [problemStyles.badge, pressed && problemStyles.pressed]}>
      <AlertIcon size={20} color={colors.danger} />
    </Pressable>
  );
}

/**
 * One quiet line under the header, so the commonest case needs no tap at all.
 *
 * The first problem only. `describeProblems` returns root causes in the order
 * they bite, and a header is not the place for a list — the rest is a tap away.
 */
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
  // Nothing to explain is not an empty sheet: the badge that opens this is gone
  // by then, and a sheet left open through a recovery should close itself.
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
