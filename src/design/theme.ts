/**
 * Bridges the TypeScript palette into CSS. Colours are declared once in
 * `palette.ts`; this module publishes them as custom properties so stylesheets
 * and the SVG exporter cannot drift apart.
 */

import { PALETTES, TINTS, type ThemeName } from './palette';

const STYLE_ELEMENT_ID = 'aas-design-tokens';

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function paletteBlock(theme: ThemeName, selector: string): string {
  const entries = Object.entries(PALETTES[theme]).map(([token, value]) => `  --c-${toKebab(token)}: ${value};`);
  return `${selector} {\n${entries.join('\n')}\n}`;
}

function tintBlock(): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [name, tint] of Object.entries(TINTS)) {
    light.push(`  --tint-${name}-line: ${tint.line};`);
    light.push(`  --tint-${name}-fill: ${tint.fill};`);
    dark.push(`  --tint-${name}-fill: ${tint.fillDark};`);
  }
  return `:root {\n${light.join('\n')}\n}\n:root[data-theme='dark'] {\n${dark.join('\n')}\n}`;
}

/** Called once before the first render so no frame paints unstyled. */
export function installDesignTokens(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = [
    paletteBlock('light', ':root'),
    paletteBlock('dark', ":root[data-theme='dark']"),
    tintBlock(),
  ].join('\n');
  document.head.appendChild(style);
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.style.colorScheme = theme;
}

export function preferredTheme(): ThemeName {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
