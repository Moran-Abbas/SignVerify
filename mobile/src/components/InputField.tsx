/**
 * InputField – Styled text input
 *
 * Design spec:
 * - surfaceContainerLow (#F3F4F5) background at rest
 * - On focus: transitions to surfaceContainerLowest (#FFFFFF) with ghost border (primary at 20%)
 * - XL (24px) radius
 * - Inter bodyLarge text
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../theme';

interface InputFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: ViewStyle;
}

export default function InputField({
  label,
  containerStyle,
  ...textInputProps
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        {...textInputProps}
        onFocus={(e) => {
          setFocused(true);
          textInputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          textInputProps.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          textInputProps.style,
        ]}
        placeholderTextColor={Colors.outline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.xs,
  },
  input: {
    fontFamily: Typography.bodyLarge.fontFamily,
    fontSize: Typography.bodyLarge.fontSize,
    // Native iOS TextInput shrinks single digits dynamically if lineHeight is forced. 
    // Omitting lineHeight and setting explicit height prevents the glitch.
    height: 52,
    width: '100%',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    color: Colors.onBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderColor: 'rgba(5, 17, 37, 0.20)', // primary at 20%
  },
});
