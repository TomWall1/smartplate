/**
 * Deals to Dish — mobile design tokens (Direction 01).
 *
 * Single source of truth for colour, type, spacing, radius and shadow.
 * Mirrors the web design system (frontend/src/index.css :root) so the app and
 * site share one brand. Screens import from here instead of hardcoding hex.
 *
 * Brand rules: gum green is the ONLY action colour; clay is the value/savings
 * highlight ONLY (never a button); sentence case; calm and premium.
 */

export const colors = {
  // Surfaces
  bg:        '#F4EEE2', // bone — app background
  surface:   '#FCFAF4', // cards / sheets
  sunken:    '#E7DECB', // oat — insets, dividers-as-fills
  // Ink
  ink:        '#2A241F', // espresso — primary text
  inkSecondary: '#6B5F52', // muted text
  inkFaint:   '#9A8E7E', // placeholders, captions
  // Brand
  brand:      '#36453B', // gum green — the ONE action colour
  brandHover: '#2A352D',
  brandTint:  '#DCE4D6', // soft green fills / active chip bg
  onBrand:    '#F4EEE2', // text on brand
  // Accent (value / savings only — never a button)
  accent:     '#BE6A43', // clay
  accentTint: '#F2E2D6',
  // Lines
  border:     '#E2D8C6',
  borderStrong: '#CFC2AC',
  // Status
  success:    '#36453B',
  danger:     '#A23E2E',
  white:      '#FFFFFF',
} as const;

// Australian supermarket brand colours — kept as-is (real brand marks).
export const storeColors: Record<string, { name: string; color: string; tint: string }> = {
  woolworths: { name: 'Woolworths', color: '#178841', tint: '#E3F1E7' },
  coles:      { name: 'Coles',      color: '#E01A22', tint: '#FBE4E5' },
  iga:        { name: 'IGA',        color: '#0A4D9C', tint: '#E2EAF6' },
};

export const fonts = {
  display:        'Fraunces_500Medium', // titles, recipe names, hero figures
  displayRegular: 'Fraunces_400Regular',
  ui:             'Inter_400Regular',    // all functional UI text
  uiMedium:       'Inter_500Medium',
} as const;

// Type scale (size / lineHeight). Use `fonts.*` for family.
export const type = {
  hero:    { fontFamily: fonts.display,   fontSize: 30, lineHeight: 36 },
  title:   { fontFamily: fonts.display,   fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fonts.uiMedium,  fontSize: 17, lineHeight: 22 },
  body:    { fontFamily: fonts.ui,        fontSize: 15, lineHeight: 22 },
  bodyMed: { fontFamily: fonts.uiMedium,  fontSize: 15, lineHeight: 22 },
  label:   { fontFamily: fonts.uiMedium,  fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.ui,        fontSize: 12, lineHeight: 16 },
  figure:  { fontFamily: fonts.display,   fontSize: 34, lineHeight: 38 }, // clay savings hero
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

export const radius = { tag: 8, card: 12, sheet: 16, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#2A241F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: '#2A241F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

export const theme = { colors, storeColors, fonts, type, spacing, radius, shadow };
export default theme;
