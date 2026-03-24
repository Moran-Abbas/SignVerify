/**
 * SecondaryButton – Tonal surface button
 *
 * Design spec:
 * - surfaceContainerHigh (#E7E8E9) background
 * - onPrimaryFixed (#101B30) text
 * - No border
 * - XL (24px) roundedness
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing } from '../theme';

interface SecondaryButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function SecondaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  style,
  textStyle,
}: SecondaryButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.button, disabled && styles.disabled, style]}
    >
      {icon && (
        <MaterialIcons
          name={icon}
          size={20}
          color={Colors.onPrimaryFixed}
          style={styles.icon}
        />
      )}
      <Text style={[styles.label, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 48,
  },
  label: {
    ...Typography.titleMedium,
    color: Colors.onPrimaryFixed,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
});
