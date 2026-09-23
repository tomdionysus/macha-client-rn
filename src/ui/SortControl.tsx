import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { MediaSort, MediaSortKey } from '@machafoundation/core';
import { Sheet, SheetOption } from './Sheet';
import { colors, radius, space, type as typography } from './theme';

interface Props {
  sorts: readonly MediaSort[];
  value: MediaSortKey;
  onChange(key: MediaSortKey): void;
}

/**
 * The one sort control every list of media carries.
 *
 * Tom's ruling, relayed by core and confirmed here 2026-09-23: every client
 * offers the same choices, in core's words, with no "Sort by" heading — each
 * option reads as a whole, "Sort By Title", which core composes as
 * `choiceLabel`. The vocabulary is core's (`SEARCH_SORTS`, `LIBRARY_SORTS`) so
 * the four clients cannot drift apart on it.
 *
 * On a phone the control is the current choice as a pill, and the choices open
 * in a sheet: a dropdown has nowhere to go at this width.
 */
export function SortControl({ sorts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = sorts.find((sort) => sort.key === value) ?? sorts[0];
  if (!current) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current.choiceLabel}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Text style={styles.label}>{current.choiceLabel}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        {sorts.map((sort) => (
          <SheetOption
            key={sort.key}
            label={sort.choiceLabel}
            selected={sort.key === current.key}
            onPress={() => {
              onChange(sort.key);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    paddingHorizontal: space.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...typography.label,
    color: colors.textDim,
  },
});
