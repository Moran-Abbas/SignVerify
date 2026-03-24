/**
 * OTPInput – Six-digit verification code input
 *
 * Design spec from Stitch Onboarding screen:
 * - 6 individual rounded square cells
 * - surfaceContainerLowest (#FFFFFF) background
 * - Ghost border on active cell
 * - Auto-focus progression between cells
 * - "Resend in 00:XX" timer
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../theme';

interface OTPInputProps {
  length?: number;
  onComplete?: (code: string) => void;
  onResend?: () => void;
  resendSeconds?: number;
}

export default function OTPInput({
  length = 6,
  onComplete,
  onResend,
  resendSeconds = 54,
}: OTPInputProps) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''));
  const [timer, setTimer] = useState(resendSeconds);
  const [activeIndex, setActiveIndex] = useState(0);
  const refs = useRef<(TextInput | null)[]>(Array(length).fill(null));

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < length - 1) {
      refs.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }

    if (newCode.every((c) => c.length === 1)) {
      onComplete?.(newCode.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setActiveIndex(index - 1);
    }
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.label}>Verification Code</Text>
        <TouchableOpacity
          onPress={() => {
            if (timer <= 0) {
              setTimer(resendSeconds);
              onResend?.();
            }
          }}
          disabled={timer > 0}
        >
          <Text style={[styles.timer, timer > 0 && styles.timerDisabled]}>
            {timer > 0 ? `Resend in ${formatTime(timer)}` : 'Resend Code'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={[styles.cell, activeIndex === i && styles.cellActive]}
            value={code[i]}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={({ nativeEvent }) =>
              handleKeyPress(nativeEvent.key, i)
            }
            onFocus={() => setActiveIndex(i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            autoFocus={i === 0}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.labelLarge,
    color: Colors.onSurfaceVariant,
  },
  timer: {
    ...Typography.labelMedium,
    color: Colors.primary,
    padding: Spacing.xs,
  },
  timerDisabled: {
    color: Colors.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    textAlign: 'center',
    fontFamily: Typography.headlineSmall.fontFamily,
    fontSize: 22,
    color: Colors.onBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellActive: {
    borderColor: 'rgba(5, 17, 37, 0.20)',
    backgroundColor: Colors.surfaceContainerLowest,
  },
});
