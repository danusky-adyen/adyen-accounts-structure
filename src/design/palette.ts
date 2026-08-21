/**
 * Single source of truth for colour. CSS reads these through the custom
 * properties injected by `theme.ts`; the SVG exporter reads the raw values so
 * exported files match the screen without a second palette to keep in sync.
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
  /** Frosted panel background, may include alpha. */
  panel: string;
  panelBorder: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  edge: string;
  edgeActive: string;
  linkEdge: string;
  shadow: string;
  shadowStrong: string;
  focus: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    canvas: '#f6f7f9',
    canvasDot: '#dfe3e9',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#f2f4f7',
    panel: 'rgba(255, 255, 255, 0.78)',
    panelBorder: 'rgba(255, 255, 255, 0.9)',
    border: '#e3e7ed',
    borderStrong: '#c9d1db',
    text: '#0b1e3b',
    textMuted: '#5c6b80',
    textFaint: '#8b97a8',
    accent: '#00b67a',
    accentText: '#00815a',
    accentSoft: '#e6fbf1',
    accentBorder: '#9fe6c8',
    danger: '#d5333a',
    dangerSoft: '#fdecec',
    warning: '#a8681a',
    warningSoft: '#fdf3e2',
    edge: '#b4bec9',
    edgeActive: '#00b67a',
    linkEdge: '#94a2b3',
    shadow: 'rgba(11, 30, 59, 0.08)',
    shadowStrong: 'rgba(11, 30, 59, 0.16)',
    focus: '#2f6fed',
  },
  dark: {
    canvas: '#0d1117',
    canvasDot: '#1e2530',
    surface: '#161b22',
    surfaceRaised: '#1c222c',
    surfaceSunken: '#11161d',
    panel: 'rgba(22, 27, 34, 0.82)',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    border: '#2a3240',
    borderStrong: '#3d4757',
    text: '#e8edf4',
    textMuted: '#9aa7b8',
    textFaint: '#6d7b8d',
    accent: '#1fd18f',
    accentText: '#5fe0b0',
    accentSoft: 'rgba(31, 209, 143, 0.14)',
    accentBorder: 'rgba(31, 209, 143, 0.45)',
    danger: '#ff6b6b',
    dangerSoft: 'rgba(255, 107, 107, 0.14)',
    warning: '#e8b465',
    warningSoft: 'rgba(232, 180, 101, 0.16)',
    edge: '#3f4b5c',
    edgeActive: '#1fd18f',
    linkEdge: '#55637a',
    shadow: 'rgba(0, 0, 0, 0.35)',
    shadowStrong: 'rgba(0, 0, 0, 0.55)',
    focus: '#5a8dff',
  },
};

/**
 * Per-kind accent used for the icon tint and the card's leading edge. Kept
 * separate from the theme palette because these hues read well on both themes.
 */
export type TintName =
  | 'navy'
  | 'amber'
  | 'violet'
  | 'teal'
  | 'green'
  | 'indigo'
  | 'slate'
  | 'yellow'
  | 'orange'
  | 'steel'
  | 'lime';

export interface Tint {
  /** Line/stroke colour for the icon. */
  line: string;
  /** Flat fill inside icon shapes. */
  fill: string;
  /** Fill used on dark theme. */
  fillDark: string;
}

export const TINTS: Record<TintName, Tint> = {
  navy: { line: '#2f4a75', fill: '#e4ecf9', fillDark: 'rgba(88, 132, 204, 0.22)' },
  amber: { line: '#a8681a', fill: '#fdefdc', fillDark: 'rgba(224, 158, 66, 0.2)' },
  violet: { line: '#6f4bb0', fill: '#f0eafb', fillDark: 'rgba(157, 122, 224, 0.2)' },
  teal: { line: '#0e7f77', fill: '#dff6f3', fillDark: 'rgba(45, 198, 184, 0.2)' },
  green: { line: '#1d7c46', fill: '#e3f6ea', fillDark: 'rgba(58, 197, 122, 0.2)' },
  indigo: { line: '#41519b', fill: '#e8ebfa', fillDark: 'rgba(120, 138, 232, 0.2)' },
  slate: { line: '#5c6b80', fill: '#eef1f5', fillDark: 'rgba(150, 168, 192, 0.16)' },
  yellow: { line: '#8a7218', fill: '#fbf5d8', fillDark: 'rgba(220, 195, 70, 0.18)' },
  orange: { line: '#a55a1f', fill: '#fdebdc', fillDark: 'rgba(230, 140, 70, 0.2)' },
  steel: { line: '#4d6072', fill: '#e9eef3', fillDark: 'rgba(130, 160, 190, 0.18)' },
  lime: { line: '#4e7a1f', fill: '#eef7dc', fillDark: 'rgba(150, 200, 70, 0.18)' },
};

export function tintFill(tint: TintName, theme: ThemeName): string {
  const value = TINTS[tint];
  return theme === 'dark' ? value.fillDark : value.fill;
}
