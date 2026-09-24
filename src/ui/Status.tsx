import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadFailureMessage } from '../api/failureMessages';
import { AlertIcon } from './Icons';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

/**
 * A spinner is only shown once a load has actually felt slow. Below this, a
 * flash of spinner is more disruptive than the wait it describes.
 */
const LOADING_INDICATOR_DELAY_MS = 600;

export function Loading({ label }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), LOADING_INDICATOR_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return <View style={styles.block} />;
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.textDim} />
      {label ? <Text style={styles.caption}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = loadFailureMessage(error);
  return (
    <View style={styles.block}>
      <AlertIcon size={26} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.caption}>{detail}</Text> : null}
    </View>
  );
}

/** A non-blocking banner for a refresh that failed while content is already on screen. */
export function InlineError({ message }: { message: string }) {
  return (
    <View style={styles.banner}>
      <AlertIcon size={16} color={colors.danger} />
      <Text style={styles.bannerText} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  caption: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.textDim,
    textAlign: 'center',
  },
  retry: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  retryText: {
    ...typography.label,
    color: colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  bannerText: {
    ...typography.caption,
    color: colors.textDim,
    flex: 1,
  },
});
