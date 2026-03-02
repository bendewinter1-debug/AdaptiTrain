// ─── Design tokens ───────────────────────────────────────────────────────────
// Single source of truth for all colors, typography, spacing, and radii.
// Import from this file instead of hardcoding values in StyleSheet.create().

export const colors = {
  // Backgrounds
  background: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  inputBg: '#0f172a',

  // Primary accent (indigo)
  primary: '#6366f1',
  primaryDark: '#4f46e5',

  // Text hierarchy
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textPlaceholder: '#475569',
  textLight: '#cbd5e1',

  // Status — success (green)
  success: '#22c55e',
  successDark: '#166534',
  successDeep: '#052e16',
  successGreen: '#16a34a',

  // Status — error (red)
  error: '#ef4444',
  errorDark: '#1c0f0f',
  errorDeeper: '#2d1515',
  errorLight: '#f87171',
  errorLighter: '#fca5a5',

  // Status — warning (yellow/amber)
  warning: '#eab308',
  warningDark: '#1c1507',
  warningBorder: '#d97706',
  warningText: '#fbbf24',
  warningDetail: '#92400e',

  // Orange / streak
  orange: '#fb923c',

  // Semantic / special purpose
  indigoDark: '#1e1b4b',
  indigoLight: '#e0e7ff',
  restBlue: '#0f4c75',
  restBlueLight: '#bae6fd',
} as const;

export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  '4xl': 22,
  '5xl': 26,
  '6xl': 28,
  '7xl': 30,
  '8xl': 34,
  icon: 64,
} as const;

export const radius = {
  xs: 3,
  sm: 5,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
  '4xl': 20,
  '5xl': 24,
  circle: 45,
} as const;

export const spacing = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  56: 56,
  70: 70,
} as const;

export const fontWeight = {
  regular: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};
