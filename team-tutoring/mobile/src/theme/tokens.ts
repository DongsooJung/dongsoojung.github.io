export const tokens = {
  color: {
    background: '#FFFFFF',
    surface: '#FAFAFA',
    text: '#111111',
    textMuted: '#777777',
    border: '#EAEAEA',
    disabled: '#CCCCCC',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  font: {
    body: 15,
    title: 20,
    heading: 26,
    weightRegular: '400' as const,
    weightBold: '700' as const,
  },
} as const;

export type Tokens = typeof tokens;
