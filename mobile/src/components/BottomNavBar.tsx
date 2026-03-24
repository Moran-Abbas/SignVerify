/**
 * BottomNavBar – 4-tab navigation
 *
 * Design spec from Stitch:
 * - Tabs: Home, History, Vault, Settings
 * - Material Icons
 * - Active tab: primaryContainer icon tint, label visible
 * - Glass-style background (surfaceVariant at 70% + blur)
 * - No top border – uses glassmorphism separation
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing, Glass } from '../theme';

type TabKey = 'home' | 'history' | 'vault' | 'settings';

interface BottomNavBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
}

const tabs: { key: TabKey; icon: keyof typeof MaterialIcons.glyphMap; label: string }[] = [
  { key: 'home', icon: 'dashboard', label: 'Home' },
  { key: 'history', icon: 'history', label: 'History' },
  { key: 'vault', icon: 'enhanced-encryption', label: 'Vault' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
              <MaterialIcons
                name={tab.icon}
                size={24}
                color={isActive ? Colors.onPrimary : Colors.onSurfaceVariant}
              />
            </View>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Glass.overlayColor,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing['2xl'] : Spacing.md,
    paddingHorizontal: Spacing.base,
    ...(Platform.OS === 'web'
      ? { backdropFilter: `blur(${Glass.blurAmount}px)` as any }
      : {}),
    // Inner glow edge
    borderTopWidth: 0.5,
    borderTopColor: Glass.innerGlowColor,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  iconWrapActive: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: Radius.lg,
    width: 56,
  },
  label: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelActive: {
    color: Colors.primaryContainer,
  },
});
