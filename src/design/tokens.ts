/**
 * Bento's non-colour primitives, copied from `@adyen/bento-design-tokens`
 * 1.105.0 and published as CSS custom properties under their Bento names, so a
 * stylesheet here can be compared against the design system line by line.
 *
 * Colour lives in `palette.ts` because it is themed and the SVG exporter needs
 * the raw values; everything in this file is theme-independent.
 */

/** `--b-spacer-*`. The whole system sits on this ramp. */
export const SPACER = {
  '000': 0,
  '010': 2,
  '020': 4,
  '030': 6,
  '040': 8,
  '050': 10,
  '060': 12,
  '070': 16,
  '080': 20,
  '090': 24,
  '100': 32,
  '110': 40,
  '120': 48,
  '130': 56,
  '140': 64,
} as const;

/** `--b-border-radius-*`. */
export const RADIUS = { xs: 2, s: 4, m: 8, l: 12, xl: 24 } as const;

/** `--b-border-width-*`. */
export const BORDER_WIDTH = { s: 1, m: 2, l: 3, attention: 1.5 } as const;

/**
 * `--b-animation-*`. Three durations and three curves cover every transition
 * in Bento: `standard` for state changes, `enter` for something arriving,
 * `exit` for something leaving.
 */
export const MOTION = {
  duration: { fast: '100ms', moderate: '150ms', slow: '250ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0.4, 0.9)',
    enter: 'cubic-bezier(0.12, 0.6, 0.4, 0.95)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    linear: 'linear',
  },
} as const;

/**
 * `--b-text-*`. Bento's scale is short on purpose: one body size, one caption
 * size, and titles. `stronger` is 500, `strongest` is 600.
 */
export const TYPE = {
  titleL: { size: 24, lineHeight: 34, weight: 600 },
  titleM: { size: 20, lineHeight: 30, weight: 600 },
  title: { size: 16, lineHeight: 26, weight: 600 },
  subtitle: { size: 16, lineHeight: 26, weight: 500 },
  body: { size: 14, lineHeight: 20, weight: 400 },
  bodyStronger: { size: 14, lineHeight: 20, weight: 500 },
  bodyStrongest: { size: 14, lineHeight: 20, weight: 600 },
  caption: { size: 12, lineHeight: 18, weight: 400 },
  captionStronger: { size: 12, lineHeight: 18, weight: 500 },
} as const;

/**
 * `--b-z-index-*`. Bento numbers the whole application, which is why the tiers
 * are this small: canvas content sits at `auto`, the inspector is elevated, the
 * toolbars are navigation, and modals and toasts interrupt everything.
 */
export const Z_INDEX = { elevated: 5, navigation: 10, instantInteraction: 15 } as const;

/** `--b-focus-ring-*`: a 1px gap in the page colour, then a 3px ring. */
export const FOCUS_RING = { spacer: BORDER_WIDTH.s, outline: BORDER_WIDTH.l } as const;

/** `--b-shadow-*`, for floating layers only. Bento cards carry no shadow. */
export const SHADOW = {
  low: '0 2px 4px rgba(0, 18, 34, 0.04), 0 1px 2px rgba(0, 18, 34, 0.02)',
  medium: '0 6px 12px rgba(0, 18, 34, 0.08), 0 2px 4px rgba(0, 18, 34, 0.04)',
  high: '0 18px 36px rgba(0, 18, 34, 0.12), 0 4px 8px rgba(0, 18, 34, 0.06)',
} as const;

/** `--b-toast-*`. */
export const TOAST = { width: 420, spacingInner: SPACER['060'], spacingOuter: SPACER['070'] } as const;

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Every primitive as a `--b-*` custom property, in Bento's own naming. */
export function tokenDeclarations(): readonly string[] {
  const lines: string[] = [];
  for (const [step, value] of Object.entries(SPACER)) lines.push(`--b-spacer-${step}: ${value}px;`);
  for (const [name, value] of Object.entries(RADIUS)) lines.push(`--b-radius-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(BORDER_WIDTH)) lines.push(`--b-border-width-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(MOTION.duration)) lines.push(`--b-duration-${name}: ${value};`);
  for (const [name, value] of Object.entries(MOTION.easing)) lines.push(`--b-ease-${name}: ${value};`);
  for (const [name, value] of Object.entries(SHADOW)) lines.push(`--b-shadow-${name}: ${value};`);
  for (const [name, value] of Object.entries(Z_INDEX)) lines.push(`--b-z-${kebab(name)}: ${value};`);
  lines.push(`--b-focus-spacer: ${FOCUS_RING.spacer}px;`);
  lines.push(`--b-focus-outline: ${FOCUS_RING.outline}px;`);
  lines.push(`--b-toast-width: ${TOAST.width}px;`);
  for (const [name, step] of Object.entries(TYPE)) {
    const step_ = kebab(name);
    lines.push(`--b-text-${step_}-size: ${step.size}px;`);
    lines.push(`--b-text-${step_}-line-height: ${step.lineHeight}px;`);
    lines.push(`--b-text-${step_}-weight: ${step.weight};`);
  }
  return lines;
}
