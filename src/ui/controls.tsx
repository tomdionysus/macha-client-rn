import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

interface ButtonProps {
  label: string;
  onPress(): void;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, busy, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        buttonStyles.base,
        variant === 'primary' && buttonStyles.primary,
        variant === 'secondary' && buttonStyles.secondary,
        variant === 'quiet' && buttonStyles.quiet,
        (disabled || busy) && buttonStyles.disabled,
        pressed && buttonStyles.pressed,
        style,
      ]}>
      {busy ? <ActivityIndicator color={colors.text} size="small" /> : icon}
      <Text style={[buttonStyles.label, variant === 'quiet' && buttonStyles.quietLabel]}>{label}</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    backgroundColor: colors.accentSurfaceStrong,
    borderColor: colors.accentEdge,
  },
  secondary: {
    backgroundColor: colors.surface2,
    borderColor: colors.borderStrong,
  },
  quiet: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingHorizontal: space.md,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  quietLabel: {
    color: colors.textDim,
  },
});

interface RowProps {
  title: string;
  detail?: string;
  /**
   * How many lines of `detail` to show before truncating.
   *
   * Two is right for a sentence of explanation, which is what most rows carry.
   * A row whose detail is a *list* — the configured nodes, say — has to be
   * told, because clamping that at two reads as a limit on how many there can
   * be rather than as a truncated view of how many there are.
   */
  detailLines?: number;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?(): void;
  active?: boolean;
}

/** A single tappable list line — tracks, episodes, seasons, settings entries. */
export function ListRow({ title, detail, detailLines = 2, leading, trailing, onPress, active }: RowProps) {
  const content = (
    <>
      {leading}
      <View style={rowStyles.text}>
        <Text numberOfLines={1} style={[rowStyles.title, active && rowStyles.activeTitle]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={detailLines} style={rowStyles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress) return <View style={rowStyles.row}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.pressed]}>
      {content}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    minHeight: TOUCH_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
  title: {
    ...typography.body,
    color: colors.text,
  },
  activeTitle: {
    color: colors.progress,
    fontWeight: '600',
  },
  detail: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
});

/** A small non-interactive fact: codec, container, resolution, mode. */
export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' }) {
  return (
    <View style={[tagStyles.tag, tone === 'accent' && tagStyles.accent]}>
      <Text style={tagStyles.label}>{label}</Text>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  tag: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  accent: {
    backgroundColor: colors.accentSurfaceStrong,
    borderColor: colors.accentEdge,
  },
  label: {
    ...typography.caption,
    color: colors.textDim,
  },
});

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: space.lg }} />;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange(value: T): void;
}

/** A two-or-three way switch for sibling views of the same library. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={segmentedStyles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              segmentedStyles.segment,
              selected && segmentedStyles.selected,
              pressed && !selected && segmentedStyles.pressed,
            ]}>
            <Text style={[segmentedStyles.label, selected && segmentedStyles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segmentedStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginHorizontal: space.lg,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  selected: {
    backgroundColor: colors.accentSurfaceStrong,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    ...typography.label,
    color: colors.textFaint,
  },
  selectedLabel: {
    color: colors.text,
  },
});
