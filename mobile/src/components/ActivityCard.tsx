/**
 * ActivityCard – Recent activity row
 *
 * Design spec from Stitch Dashboard:
 * - Icon (left), document name + subtitle (center), SecurityChip (right)
 * - surfaceContainerLowest (#FFFFFF) background (tonal layering – no borders)
 * - Card separation via background shift, not divider lines
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import SecurityChip from './SecurityChip';
import { Colors, Typography, Radius, Spacing } from '../theme';

export type ActivityStatus = 'verified' | 'pending' | 'rejected';

interface ActivityCardProps {
  key?: string | number;
  documentName: string;
  subtitle: string;
  status: ActivityStatus;
  icon?: keyof typeof MaterialIcons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
}

const statusIconMap: Record<ActivityStatus, { icon: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  verified: { icon: 'check-circle', color: Colors.secondary },
  pending: { icon: 'visibility', color: Colors.onSurfaceVariant },
  rejected: { icon: 'warning', color: Colors.error },
};

export default function ActivityCard({
  documentName,
  subtitle,
  status,
  icon,
  iconColor,
  onPress,
}: ActivityCardProps) {
  const statusIcon = statusIconMap[status];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.card}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons
          name={icon ?? statusIcon.icon}
          size={22}
          color={iconColor ?? statusIcon.color}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {documentName}
        </Text>
        <Text style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
      <SecurityChip variant={status} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.titleSmall,
    color: Colors.onBackground,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});
