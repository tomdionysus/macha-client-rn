import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBottomChromeInset } from './chrome';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

const VISIBLE_MS = 3_200;
const FADE_MS = 180;
/** Entrance rise, in points. */
const RISE = 12;

export interface Toast {
  message: string;
  /** Leading glyph, usually the tapped control's. */
  icon?: React.ReactNode;
  action?: { label: string; onPress(): void };
}

interface ShownToast extends Toast {
  key: number;
}

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/**
 * Transient confirmation for an action whose effect is off-screen; never the
 * home of durable state. Not a queue: a new toast replaces the current one.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ShownToast | undefined>(undefined);
  const nextKey = useRef(0);

  const show = useCallback((next: Toast) => {
    nextKey.current += 1;
    setToast({ ...next, key: nextKey.current });
  }, []);

  const dismiss = useCallback((key: number) => {
    // A stale fade-out must not clear a newer toast.
    setToast((current) => (current?.key === key ? undefined : current));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <Banner key={toast.key} toast={toast} onDone={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: Toast) => void {
  return useContext(ToastContext);
}

function Banner({ toast, onDone }: { toast: ShownToast; onDone(key: number): void }) {
  const bottom = useBottomChromeInset();
  const entrance = useRef(new Animated.Value(0)).current;
  const { key } = toast;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(entrance, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone(key);
      });
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [entrance, key, onDone]);

  return (
    <Animated.View
      // Above the docked chrome, which stays reachable.
      style={[
        styles.host,
        {
          bottom: bottom + space.sm,
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
          ],
        },
      ]}
      pointerEvents="box-none">
      <View style={styles.banner} accessibilityLiveRegion="polite">
        {toast.icon}
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={8}
            onPress={() => {
              onDone(key);
              toast.action?.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    // Opaque because it floats over artwork.
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  message: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
  action: {
    minHeight: TOUCH_TARGET - space.md,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  actionText: {
    ...typography.label,
    color: colors.progress,
  },
  pressed: {
    opacity: 0.6,
  },
});
