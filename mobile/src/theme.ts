/**
 * SignVerify Design System Tokens
 * Extracted from the Stitch "Digital Vault" design system.
 *
 * Creative North Star: "The Digital Vault"
 * - Intentional asymmetry, expansive breathing room, sophisticated tonal layering
 * - "Surface-on-Surface" philosophy – no explicit borders
 * - Glassmorphism for overlays and nav bars
 */

export const LightTheme = {
  primary: '#051125',
  primaryContainer: '#1B263B',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#828DA7',
  onPrimaryFixed: '#101B30',
  onPrimaryFixedVariant: '#3C475D',
  primaryFixed: '#D7E2FF',
  primaryFixedDim: '#BBC6E2',
  inversePrimary: '#BBC6E2',
  secondary: '#2C694E',
  secondaryContainer: '#AEEECB',
  onSecondary: '#FFFFFF',
  onSecondaryContainer: '#316E52',
  onSecondaryFixed: '#002114',
  onSecondaryFixedVariant: '#0E5138',
  secondaryFixed: '#B1F0CE',
  secondaryFixedDim: '#95D4B3',
  tertiary: '#2D0009',
  tertiaryContainer: '#540018',
  onTertiary: '#FFFFFF',
  onTertiaryContainer: '#FF466D',
  onTertiaryFixed: '#400010',
  onTertiaryFixedVariant: '#910030',
  tertiaryFixed: '#FFD9DC',
  tertiaryFixedDim: '#FFB2BA',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onError: '#FFFFFF',
  onErrorContainer: '#93000A',
  warning: '#914C00',
  warningContainer: '#FFDCC3',
  onWarning: '#FFFFFF',
  onWarningContainer: '#2E1500',
  surface: '#F8F9FA',
  surfaceDim: '#D9DADB',
  surfaceBright: '#F8F9FA',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F3F4F5',
  surfaceContainer: '#EDEEEF',
  surfaceContainerHigh: '#E7E8E9',
  surfaceContainerHighest: '#E1E3E4',
  surfaceTint: '#545E76',
  surfaceVariant: '#E1E3E4',
  inverseSurface: '#2E3132',
  inverseOnSurface: '#F0F1F2',
  onBackground: '#191C1D',
  onSurface: '#191C1D',
  onSurfaceVariant: '#45474D',
  background: '#F8F9FA',
  outline: '#75777D',
  outlineVariant: '#C5C6CD',
  success: '#2C694E',
};

export const DarkTheme = {
  primary: '#BBC6E2', // Muted Silver-Blue
  primaryContainer: '#1B263B',
  onPrimary: '#05070A',
  onPrimaryContainer: '#D7E2FF',
  onPrimaryFixed: '#D7E2FF',
  onPrimaryFixedVariant: '#BBC6E2',
  primaryFixed: '#051125',
  primaryFixedDim: '#1B263B',
  inversePrimary: '#051125',
  secondary: '#B1F0CE',
  secondaryContainer: '#0E5138',
  onSecondary: '#002114',
  onSecondaryContainer: '#B1F0CE',
  onSecondaryFixed: '#B1F0CE',
  onSecondaryFixedVariant: '#95D4B3',
  secondaryFixed: '#002114',
  secondaryFixedDim: '#0E5138',
  tertiary: '#FFD9DC',
  tertiaryContainer: '#910030',
  onTertiary: '#400010',
  onTertiaryContainer: '#FFD9DC',
  onTertiaryFixed: '#FFD9DC',
  onTertiaryFixedVariant: '#FFB2BA',
  tertiaryFixed: '#2D0009',
  tertiaryFixedDim: '#540018',
  error: '#FFB4AB',
  errorContainer: '#93000A',
  onError: '#690005',
  onErrorContainer: '#FFDAD6',
  warning: '#FFB870',
  warningContainer: '#6D3900',
  onWarning: '#4D2600',
  onWarningContainer: '#FFDCC3',
  surface: '#05070A', // Deepest Navy
  surfaceDim: '#0A0E14',
  surfaceBright: '#161C27',
  surfaceContainerLowest: '#030508',
  surfaceContainerLow: '#0E121A',
  surfaceContainer: '#161C27',
  surfaceContainerHigh: '#1E2532',
  surfaceContainerHighest: '#293140',
  surfaceTint: '#BBC6E2',
  surfaceVariant: '#303540',
  inverseSurface: '#E1E2E6',
  inverseOnSurface: '#05070A',
  onBackground: '#E1E2E6',
  onSurface: '#E1E2E6',
  onSurfaceVariant: '#8C919D',
  background: '#05070A',
  outline: '#303540',
  outlineVariant: '#444955',
  success: '#B1F0CE',
};

export let Colors = LightTheme;

export function setTheme(mode: 'light' | 'dark') {
  Colors = mode === 'light' ? LightTheme : DarkTheme;
}

export const Typography = {
  // ── Headline (Manrope – authoritative, geometric) ───────
  displayLarge:  { fontFamily: 'Manrope_700Bold', fontSize: 57, lineHeight: 64 },
  displayMedium: { fontFamily: 'Manrope_700Bold', fontSize: 45, lineHeight: 52 },
  displaySmall:  { fontFamily: 'Manrope_700Bold', fontSize: 36, lineHeight: 44 },
  headlineLarge: { fontFamily: 'Manrope_700Bold', fontSize: 32, lineHeight: 40 },
  headlineMedium:{ fontFamily: 'Manrope_600SemiBold', fontSize: 28, lineHeight: 36 },
  headlineSmall: { fontFamily: 'Manrope_600SemiBold', fontSize: 24, lineHeight: 32 },

  // ── Title / Body / Label (Inter – utility, legible) ─────
  titleLarge:  { fontFamily: 'Inter_600SemiBold', fontSize: 22, lineHeight: 28 },
  titleMedium: { fontFamily: 'Inter_500Medium',   fontSize: 16, lineHeight: 24 },
  titleSmall:  { fontFamily: 'Inter_500Medium',   fontSize: 14, lineHeight: 20 },

  bodyLarge:   { fontFamily: 'Inter_400Regular',   fontSize: 16, lineHeight: 24 },
  bodyMedium:  { fontFamily: 'Inter_400Regular',   fontSize: 14, lineHeight: 20 },
  bodySmall:   { fontFamily: 'Inter_400Regular',   fontSize: 12, lineHeight: 16 },

  labelLarge:  { fontFamily: 'Inter_500Medium',    fontSize: 14, lineHeight: 20 },
  labelMedium: { fontFamily: 'Inter_500Medium',    fontSize: 12, lineHeight: 16 },
  labelSmall:  { fontFamily: 'Inter_500Medium',    fontSize: 11, lineHeight: 16 },
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

/**
 * Gradient definitions for the signature CTA buttons.
 * 135° angle from primary → primaryContainer.
 */
export const Gradients = {
  primaryCta: {
    colors: [Colors.primary, Colors.primaryContainer],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

/**
 * Ambient shadow spec from the design system.
 * 32px blur, 8px Y-offset, onPrimaryFixed at 6% opacity.
 */
export const Shadows = {
  sm: {
    shadowColor: Colors.onPrimaryFixed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  ambient: {
    shadowColor: Colors.onPrimaryFixed,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 4,
  },
} as const;

/**
 * Glassmorphism overlay spec.
 * surfaceVariant at 70% opacity with 20px backdrop-blur.
 * (Note: backdrop-blur requires react-native-blur or web only;
 *  on native we approximate with semi-transparent overlay.)
 */
export const Glass = {
  overlayColor: 'rgba(225, 227, 228, 0.70)', // surfaceVariant 70%
  blurAmount: 20,
  innerGlowColor: 'rgba(255, 255, 255, 0.30)', // surfaceContainerLowest 30%
  ghostBorderColor: 'rgba(197, 198, 205, 0.15)', // outlineVariant 15%
} as const;
