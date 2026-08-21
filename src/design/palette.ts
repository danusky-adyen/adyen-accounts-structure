/**
 * Single source of truth for colour. CSS reads these through the custom
 * properties injected by `theme.ts`; the SVG exporter reads the raw values so
 * exported files match the screen without a second palette to keep in sync.
 *
 * Every value comes from Bento, Adyen's design system (`@adyen/bento-design-
 * tokens` 1.105.0). The Bento token each one implements is named in a comment,
 * so a token change upstream is a one-line change here. Values are copied
 * rather than imported because the package lives on Adyen's internal registry
 * and this tool has to build anywhere.
 */

export type ThemeName = 'light' | 'dark';

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
  /** Floating panel background. Bento panels are opaque, not frosted. */
  panel: string;
  panelBorder: string;
  border: string;
  borderHover: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;
  accent: string;
  accentText: string;
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
    canvas: '#f4f5f6', // background-secondary
    canvasDot: '#dadddf', // separator-primary
    surface: '#ffffff', // background-primary
    surfaceRaised: '#ffffff', // background-modal
    surfaceSunken: '#ecedef', // background-tertiary
    surfaceHover: '#f4f5f6', // background-primary-hover
    surfaceActive: '#ecedef', // background-primary-active
    panel: '#ffffff', // background-modal
    panelBorder: '#dadddf', // outline-primary
    border: '#dadddf', // outline-primary
    borderHover: '#c8ccd0', // outline-primary-hover
    borderStrong: '#c8ccd0', // outline-secondary
    text: '#001222', // label-primary
    textMuted: '#5c6874', // label-secondary
    textFaint: '#8c959d', // label-tertiary
    textInverse: '#ffffff', // label-inverse-primary
    accent: '#008845', // background-success-strong
    accentText: '#00773c', // label-on-background-success-weak
    accentSoft: '#cef6e2', // background-navigation
    accentBorder: '#9dedc6', // background-navigation-active
    danger: '#dc3801', // background-critical-strong
    dangerText: '#c13101', // label-on-background-critical-weak
    dangerSoft: '#fff3ef', // background-critical-weak
    warning: '#955900', // label-on-background-warning-weak
    warningSoft: '#fff4e5', // background-warning-weak
    highlight: '#0f75dc', // background-highlight-strong
    highlightSoft: '#f0f6fd', // background-highlight-weak
    platformSurface: '#f0f6fd', // background-highlight-weak
    edge: '#c8ccd0', // separator-secondary
    edgeActive: '#008845', // background-success-strong
    linkEdge: '#8c959d', // label-tertiary
    shadow: 'rgba(0, 18, 34, 0.08)', // support-shadow at shadow-medium alpha
    shadowStrong: 'rgba(0, 18, 34, 0.12)', // support-shadow at shadow-high alpha
    overlay: 'rgba(0, 18, 34, 0.4)', // support-overlay
    focus: 'rgba(15, 117, 220, 0.8)', // focus-ring-color
  },
  dark: {
    canvas: '#111111', // background-primary
    canvasDot: '#444444', // separator-primary
    surface: '#2a2a2a', // background-secondary
    surfaceRaised: '#363636', // background-modal
    // Bento's dark `background-primary` is the canvas colour, so a sunken
    // surface has to step *up* to stay visible on a card.
    surfaceSunken: '#3d3d3d', // background-tertiary
    surfaceHover: '#363636', // background-secondary-hover
    surfaceActive: '#444444', // background-secondary-active
    panel: '#363636', // background-modal
    panelBorder: '#444444', // outline-primary
    border: '#444444', // outline-primary
    borderHover: '#525252', // outline-primary-hover
    borderStrong: '#525252', // outline-secondary
    text: '#ededed', // label-primary
    textMuted: '#a4a4a4', // label-secondary
    textFaint: '#7d7d7d', // label-tertiary
    textInverse: '#111111', // label-inverse-primary
    accent: '#00d16a', // background-success-strong
    accentText: '#00d16a', // label-on-background-success-weak
    accentSoft: '#00381d', // background-navigation
    accentBorder: '#004724', // background-navigation-hover
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
    platformSurface: '#152d45', // background-highlight-weak over background-secondary
    edge: '#525252', // separator-secondary
    edgeActive: '#00d16a', // background-success-strong
    linkEdge: '#7d7d7d', // label-tertiary
    shadow: 'rgba(0, 0, 0, 0.4)', // support-shadow
    shadowStrong: 'rgba(0, 0, 0, 0.6)', // support-shadow
    overlay: 'rgba(0, 0, 0, 0.6)', // support-overlay
    focus: 'rgba(15, 117, 220, 0.8)', // focus-ring-color
  },
};

/**
 * Per-kind accent for the icon tile. Bento's palette is deliberately narrow, so
 * the fifteen kinds share four families built from real weak-background and
 * on-weak-label pairs: blue for the parties you sell with, orange for in-person
 * hardware and instruments, green for anything holding money, grey for
 * compliance and reference records.
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
  // background-success-weak / label-on-background-success-weak
  green: { line: '#00773c', lineDark: '#00d16a', fill: '#e4faef', fillDark: '#00381d' },
  // background-tertiary / label-secondary
  grey: { line: '#5c6874', lineDark: '#a4a4a4', fill: '#ecedef', fillDark: '#3d3d3d' },
};

export function tintFill(tint: TintName, theme: ThemeName): string {
  const value = TINTS[tint];
  return theme === 'dark' ? value.fillDark : value.fill;
}

export function tintLine(tint: TintName, theme: ThemeName): string {
  const value = TINTS[tint];
  return theme === 'dark' ? value.lineDark : value.line;
}
