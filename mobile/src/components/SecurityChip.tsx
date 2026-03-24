/**
 * SecurityChip – Status badges
 *
 * Three variants from Stitch:
 * - verified:  secondaryContainer bg + onSecondaryContainer text
 * - pending:   surfaceContainerHigh bg + onSurfaceVariant text
 * - rejected:  tertiaryFixed (error pink) bg + onTertiaryContainer text
 *
 * All fully rounded (pill shape).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing } from '../theme';

type ChipVariant = 'verified' | 'pending' | 'rejected' | 'encrypted';

interface SecurityChipProps {
  variant: ChipVariant;
  label?: string;
}

const chipConfig: Record<
  ChipVariant,
  { bg: string; text: string; icon: keyof typeof MaterialIcons.glyphMap; defaultLabel: string }
> = {
  verified: {
    bg: Colors.secondaryContainer,
    text: Colors.onSecondaryContainer,
    icon: 'verified',
    defaultLabel: 'Verified',
  },
  pending: {
    bg: Colors.surfaceContainerHigh,
    text: Colors.onSurfaceVariant,
    icon: 'schedule',
    defaultLabel: 'Pending',
  },
  rejected: {
    bg: Colors.tertiaryFixed,
    text: Colors.onTertiaryContainer,
    icon: 'error-outline',
    defaultLabel: 'Rejected',
  },
  encrypted: {
    bg: Colors.secondaryContainer,
    text: Colors.onSecondaryContainer,
    icon: 'lock',
    defaultLabel: 'END-TO-END ENCRYPTED',
  },
};

export default function SecurityChip({ variant, label }: SecurityChipProps) {
  const config = chipConfig[variant] || chipConfig.pending;
  return (
    <View style={[styles.chip, { backgroundColor: config.bg }]}>
      <MaterialIcons
        name={config.icon}
        size={14}
        color={config.text}
        style={styles.icon}
      />
      <Text style={[styles.label, { color: config.text }]}>
        {label ?? config.defaultLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: Spacing.xs,
  },
  label: {
    ...Typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
