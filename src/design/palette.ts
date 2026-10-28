/**
 * Single source of truth for colour. CSS reads these through the custom
 * properties injected by `theme.ts`; the SVG exporter reads the raw values so
 * exported files match the screen without a second palette to keep in sync.
 *
 * The neutrals follow the Adyen brand colour system: Adyen Black (3200) and
 * its 32-tone lightness scale, preferring percentage tints of Adyen Black on
 * light backgrounds and of white on dark ones. Adyen Green is only ever used at
 * full strength, for highlights, calls to action and positive states, with
 * Adyen Black on top of it. The supporting blue, orange and red come from
 * Bento, Adyen's design system, and are named after their Bento token.
 */

export type ThemeName = 'light' | 'dark';

/** Adyen Green. Always used at 100%. */
export const ADYEN_GREEN = '#00d16a';

/**
 * The Adyen Black scale, from 0100 (lightest) to 3200 (Adyen Black). Steps
 * 0100, 0200, 0500, 1400, 1800, 2100, 2500 and 3200 are the published values;
 * the rest are interpolated between them on the same CIELAB lightness ramp
 * (97.0 down to 5.0 in 32 even steps) the brand scale was generated with.
 */
export const BLACK = {
  '0000': '#ffffff',
  '0100': '#f5f6f7',
  '0200': '#ecedef',
  '0300': '#e4e6e8',
  '0400': '#dadde0',
  '0500': '#d1d5d8',
  '0600': '#c9cdd1',
  '0700': '#c0c5c9',
  '0800': '#b7bdc2',
  '0900': '#afb5bb',
  '1000': '#a6adb3',
  '1100': '#9da5ac',
  '1200': '#959da5',
  '1300': '#8d959e',
  '1400': '#848d96',
  '1500': '#7c8690',
  '1600': '#747f89',
  '1700': '#6c7782',
  '1800': '#636f7a',
  '1900': '#5c6974',
  '2000': '#55616e',
  '2100': '#4d5a67',
  '2200': '#465361',
  '2300': '#3e4c5a',
  '2400': '#374554',
  '2500': '#2f3e4d',
  '2600': '#293847',
  '2700': '#223141',
  '2800': '#1c2b3a',
  '2900': '#152534',
  '3000': '#0f1e2e',
  '3100': '#081928',
  '3200': '#001222',
} as const;

/** Adyen Black at a percentage, for tints on light backgrounds. */
const black = (alpha: number): string => `rgba(0, 18, 34, ${alpha})`;
/** White at a percentage, for tints on dark backgrounds. */
const white = (alpha: number): string => `rgba(255, 255, 255, ${alpha})`;

export interface Palette {
  /** Page background behind the canvas. */
  canvas: string;
  /** Subtle dot-grid colour painted onto the canvas. */
  canvasDot: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceHover: string;
  surfaceActive: string;
  /** Floating panel background. Panels are opaque, not frosted. */
  panel: string;
  panelBorder: string;
  border: string;
  borderHover: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;
  /** Adyen Green: fills, rings and indicators. */
  accent: string;
  /** Text and icons placed on an `accent` fill. */
  onAccent: string;
  /** Text that belongs to an accented control, legible on a plain surface. */
  accentText: string;
  /** Background of a selected or active state. Neutral: green is never tinted. */
  accentSoft: string;
  accentBorder: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  highlight: string;
  highlightSoft: string;
  /** Card fill for the accounts a balance platform owns. */
  platformSurface: string;
  edge: string;
  edgeActive: string;
  linkEdge: string;
  shadow: string;
  shadowStrong: string;
  /** Scrim behind a modal. */
  overlay: string;
  focus: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    canvas: BLACK['0100'],
    canvasDot: BLACK['0500'],
    surface: BLACK['0000'],
    surfaceRaised: BLACK['0000'],
    surfaceSunken: black(0.075), // 0200
    surfaceHover: black(0.039), // 0100
    surfaceActive: black(0.075), // 0200
    panel: BLACK['0000'],
    panelBorder: black(0.18), // 0500, the border tone
    border: black(0.18), // 0500
    borderHover: black(0.282), // 0800
    borderStrong: black(0.282), // 0800
    text: BLACK['3200'], // primary text
    textMuted: BLACK['1800'], // secondary text
    textFaint: BLACK['1400'], // tertiary text
    textInverse: BLACK['0000'],
    accent: ADYEN_GREEN,
    onAccent: BLACK['3200'],
    // Green text on white is unreadable; the green ring or fill beside it
    // carries the accent instead.
    accentText: BLACK['3200'],
    accentSoft: black(0.075), // 0200
    accentBorder: ADYEN_GREEN,
    danger: '#dc3801', // background-critical-strong
    dangerText: '#c13101', // label-on-background-critical-weak
    dangerSoft: '#fff3ef', // background-critical-weak
    warning: '#955900', // label-on-background-warning-weak
    warningSoft: '#fff4e5', // background-warning-weak
    highlight: '#0f75dc', // background-highlight-strong
    highlightSoft: '#f0f6fd', // background-highlight-weak
    platformSurface: '#f0f6fd', // background-highlight-weak
    edge: BLACK['0600'],
    edgeActive: ADYEN_GREEN,
    linkEdge: BLACK['1400'],
    shadow: black(0.08),
    shadowStrong: black(0.12),
    overlay: black(0.4),
    focus: 'rgba(15, 117, 220, 0.8)', // focus-ring-color
  },
  dark: {
    canvas: BLACK['3200'],
    canvasDot: white(0.12),
    surface: BLACK['2900'],
    surfaceRaised: BLACK['2700'],
    // White tints step *up* from the card, so a sunken surface stays visible.
    surfaceSunken: white(0.07),
    surfaceHover: white(0.05),
    surfaceActive: white(0.1),
    panel: BLACK['2800'],
    panelBorder: white(0.12),
    border: white(0.145), // 0400
    borderHover: white(0.279), // 0800
    borderStrong: white(0.279), // 0800
    text: BLACK['0000'],
    textMuted: white(0.72),
    textFaint: white(0.5),
    textInverse: BLACK['3200'],
    accent: ADYEN_GREEN,
    onAccent: BLACK['3200'],
    accentText: ADYEN_GREEN,
    accentSoft: white(0.1),
    accentBorder: ADYEN_GREEN,
    danger: '#ff9a78', // background-critical-strong
    dangerText: '#ff9a78', // label-on-background-critical-weak
    dangerSoft: '#5c1800', // background-critical-weak
    warning: '#ff9e11', // label-on-background-warning-weak
    warningSoft: '#462a00', // background-warning-weak
    highlight: '#84b9ed', // background-highlight-strong
    highlightSoft: '#00305f', // background-highlight-weak
    // Dark `background-highlight-weak` is tuned for a full-bleed banner and
    // reads as a selection on a card, so it is blended half-and-half into the
    // card surface: enough to group the subtree, quiet enough to sit beside it.
    platformSurface: '#0a2b4a', // background-highlight-weak over Black 2900
    edge: BLACK['2300'],
    edgeActive: ADYEN_GREEN,
    linkEdge: BLACK['1500'],
    shadow: 'rgba(0, 0, 0, 0.4)',
    shadowStrong: 'rgba(0, 0, 0, 0.6)',
    overlay: 'rgba(0, 0, 0, 0.6)',
    focus: 'rgba(15, 117, 220, 0.8)', // focus-ring-color
  },
};

/**
 * Per-kind accent for the icon tile. The fifteen kinds share four families:
 * blue for the parties you sell with and orange for in-person hardware and
 * instruments (Bento weak-background and on-weak-label pairs), Adyen Green for
 * anything holding money, and Adyen Black tones for compliance and reference
 * records.
 */
export type TintName = 'blue' | 'orange' | 'green' | 'grey';

export interface Tint {
  /** Line/stroke colour for the icon. */
  line: string;
  lineDark: string;
  /** Flat fill inside icon shapes. */
  fill: string;
  fillDark: string;
}

export const TINTS: Record<TintName, Tint> = {
  // background-highlight-weak / label-on-background-highlight-weak
  blue: { line: '#0065c9', lineDark: '#84b9ed', fill: '#f0f6fd', fillDark: '#00305f' },
  // background-warning-weak / label-on-background-warning-weak
  orange: { line: '#955900', lineDark: '#ff9e11', fill: '#fff4e5', fillDark: '#462a00' },
  // Adyen Green at full strength with Adyen Black on it, never a pale tint.
  green: { line: BLACK['3200'], lineDark: BLACK['3200'], fill: ADYEN_GREEN, fillDark: ADYEN_GREEN },
  // Black 0200 / 1800 on light, Black 2600 / 0800 on dark
  grey: { line: BLACK['1800'], lineDark: BLACK['0800'], fill: BLACK['0200'], fillDark: BLACK['2600'] },
};

export function tintFill(tint: TintName, theme: ThemeName): string {
  const value = TINTS[tint];
  return theme === 'dark' ? value.fillDark : value.fill;
}

export function tintLine(tint: TintName, theme: ThemeName): string {
  const value = TINTS[tint];
  return theme === 'dark' ? value.lineDark : value.line;
}
