/**
 * SignVerify Global Styles
 * Shared style utilities implementing the "Digital Vault" design philosophy.
 *
 * Rules enforced:
 * - No 1px solid borders (the "No-Line Rule")
 * - No pure black (#000000) for text
 * - Minimum md (12px) corner radius on all elements
 * - Background shifts + spacing for section boundaries
 */

import { StyleSheet, Platform } from 'react-native';
import { Colors, Typography, Radius, Spacing, Shadows, Glass } from './theme';

const globalStyles = StyleSheet.create({
  // ── Typography Styles ─────────────────────────────────────
  displayLarge:   { ...Typography.displayLarge,   color: Colors.onBackground },
  displayMedium:  { ...Typography.displayMedium,  color: Colors.onBackground },
  displaySmall:   { ...Typography.displaySmall,   color: Colors.onBackground },
  headlineLarge:  { ...Typography.headlineLarge,   color: Colors.onBackground },
  headlineMedium: { ...Typography.headlineMedium,  color: Colors.onBackground },
  headlineSmall:  { ...Typography.headlineSmall,   color: Colors.onBackground },
  titleLarge:     { ...Typography.titleLarge,      color: Colors.onBackground },
  titleMedium:    { ...Typography.titleMedium,     color: Colors.onBackground },
  titleSmall:     { ...Typography.titleSmall,      color: Colors.onBackground },
  bodyLarge:      { ...Typography.bodyLarge,       color: Colors.onBackground },
  bodyMedium:     { ...Typography.bodyMedium,      color: Colors.onBackground },
  bodySmall:      { ...Typography.bodySmall,       color: Colors.onBackground },
  labelLarge:     { ...Typography.labelLarge,      color: Colors.onSurfaceVariant },
  labelMedium:    { ...Typography.labelMedium,     color: Colors.onSurfaceVariant },
  labelSmall:     { ...Typography.labelSmall,      color: Colors.onSurfaceVariant },

  // Secondary text (de-emphasized layer per design system)
  textSecondary: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },

  // ── Surface Styles ────────────────────────────────────────
  surfaceBase: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  surfaceLow: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  surfaceContainer: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  surfaceHigh: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    padding: Spacing.base,
  },
  /** Primary interactive floating layer – white cards */
  cardElevated: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    ...Shadows.ambient,
  },
  /** Tonal layering – card nested inside a container wrap */
  cardTonal: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },

  // ── Glassmorphism Overlay ─────────────────────────────────
  glassOverlay: {
    backgroundColor: Glass.overlayColor,
    borderRadius: Radius.xl,
    ...(Platform.OS === 'web'
      ? { backdropFilter: `blur(${Glass.blurAmount}px)` as any }
      : {}),
    // Inner glow simulation
    borderWidth: 0.5,
    borderColor: Glass.innerGlowColor,
  },

  // ── Layout Helpers ────────────────────────────────────────
  screenPadding: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  /** Asymmetric margins for editorial headline feel */
  asymmetricHeadline: {
    marginLeft: Spacing.xl,
    marginRight: Spacing['2xl'],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  rowBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  center: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  /** 40px gap between major functional blocks (design system rule) */
  sectionGap: {
    marginTop: Spacing['3xl'],
  },

  // ── Ghost Border (accessibility fallback) ─────────────────
  ghostBorder: {
    borderWidth: 1,
    borderColor: Glass.ghostBorderColor,
  },
});

export default globalStyles;
