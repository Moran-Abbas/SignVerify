/**
 * GradientButton – Primary CTA
 *
 * Design spec:
 * - Gradient fill: primary (#051125) → primaryContainer (#1B263B) at 135°
 * - XL (24px) rounded corners
 * - Manrope headline-sm white text
 * - Ambient shadow: 32px blur, 8px Y, onPrimaryFixed at 6%
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing, Gradients, Shadows } from '../theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function GradientButton({
  title,
  onPress,
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.wrapper, disabled && styles.disabled, style]}
    >
      <LinearGradient
        colors={[Colors.primary, Colors.primaryContainer]}
        start={Gradients.primaryCta.start}
        end={Gradients.primaryCta.end}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color={Colors.onPrimary} size="small" />
        ) : (
          <>
            {icon && (
              <MaterialIcons
                name={icon}
                size={20}
                color={Colors.onPrimary}
                style={styles.icon}
              />
            )}
            <Text style={[styles.label, textStyle]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.ambient,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    minHeight: 52,
  },
  label: {
    ...Typography.headlineSmall,
    fontSize: 16,
    color: Colors.onPrimary,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
});
