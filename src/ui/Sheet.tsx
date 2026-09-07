import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon } from './Icons';
import { colors, radius, space, type as typography, TOUCH_TARGET } from './theme';

interface SheetProps {
  visible: boolean;
  title: string;
  onClose(): void;
  children: React.ReactNode;
}

/**
 * A bottom sheet. Options live at the bottom of the screen because that is
 * where a thumb is, and dismissing by tapping the scrim keeps the escape
 * gesture available without a second control.
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={styles.close}>
            <CloseIcon size={18} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

interface OptionProps {
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress(): void;
}

export function SheetOption({ label, detail, selected, disabled, onPress }: OptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        disabled && styles.optionDisabled,
        pressed && styles.pressed,
      ]}>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
      </View>
      {selected ? <View style={styles.tick} /> : null}
    </Pressable>
  );
}

export function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: colors.backgroundLift,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    marginTop: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  close: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  section: {
    marginTop: space.lg,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.sm,
  },
  option: {
    minHeight: TOUCH_TARGET + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionSelected: {
    backgroundColor: colors.accentSurfaceStrong,
    borderColor: colors.accentEdge,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  optionText: {
    flex: 1,
    paddingVertical: space.sm,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textDim,
  },
  optionLabelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  optionDetail: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  tick: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.progress,
  },
});
