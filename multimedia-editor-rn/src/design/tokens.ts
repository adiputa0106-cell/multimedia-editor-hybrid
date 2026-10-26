/**
 * Design System — Colors, Typography, Spacing
 * Tema dark premium untuk Multimedia Editor RN
 */

export const Colors = {
  // Backgrounds
  bg: '#0D0D0F',
  bgCard: '#161618',
  bgSurface: '#1E1E22',
  bgElevated: '#26262B',
  bgOverlay: 'rgba(0,0,0,0.75)',

  // Borders
  border: '#2A2A30',
  borderActive: '#6C63FF',

  // Brand/Accent
  primary: '#6C63FF',
  primaryDark: '#5A52D5',
  primaryGlow: 'rgba(108,99,255,0.25)',
  accent: '#FF6B9D',
  accentGlow: 'rgba(255,107,157,0.2)',
  success: '#4ADE80',
  warning: '#FB923C',
  error: '#F87171',
  info: '#38BDF8',

  // Text
  textPrimary: '#F0F0F5',
  textSecondary: '#9898A6',
  textMuted: '#5A5A68',
  textDisabled: '#3A3A45',

  // Utility
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;
