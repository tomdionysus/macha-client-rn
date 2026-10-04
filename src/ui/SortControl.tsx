import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { MediaSort, MediaSortKey } from '@machafoundation/core';
import { sortChoiceLabel } from './labels';
import { Sheet, SheetOption } from './Sheet';
import { colors, radius, space, type as typography } from './theme';

interface Props {
  sorts: readonly MediaSort[];
  value: MediaSortKey;
  onChange(key: MediaSortKey): void;
}

/**
 * Sort control for media lists: a pill showing the current choice that opens
 * a sheet. Keys and orders come from core (`SEARCH_SORTS`, `LIBRARY_SORTS`).
 */
export function SortControl({ sorts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = sorts.find((sort) => sort.key === value) ?? sorts[0];
  if (!current) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sortChoiceLabel(current.key)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Text style={styles.label}>{sortChoiceLabel(current.key)}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        {sorts.map((sort) => (
          <SheetOption
            key={sort.key}
            label={sortChoiceLabel(sort.key)}
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
