/**
 * Guards the design layer. The palette and the primitive tokens are the only
 * place a colour or a size is allowed to be written down, and both the DOM and
 * the SVG exporter read them, so a typo here silently changes exports.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PALETTES, TINTS, tintFill, tintLine, type Palette } from '../src/design/palette';
import { CARD, TREE } from '../src/layout/metrics';
import { RADIUS, SPACER, TYPE, Z_INDEX, tokenDeclarations } from '../src/design/tokens';

const HEX_OR_RGBA = /^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/;

describe('palette', () => {
  it('defines the same tokens in both themes', () => {
    expect(Object.keys(PALETTES.dark)).toEqual(Object.keys(PALETTES.light));
  });

  it('only holds values the SVG exporter can write into an attribute', () => {
    for (const [theme, palette] of Object.entries(PALETTES)) {
      for (const [token, value] of Object.entries(palette)) {
        expect(value, `${theme}.${token}`).toMatch(HEX_OR_RGBA);
      }
    }
  });

  it('separates foreground from background in both themes', () => {
    const contrasting: ReadonlyArray<[keyof Palette, keyof Palette]> = [
      ['text', 'surface'],
      ['textMuted', 'surface'],
      ['text', 'canvas'],
      ['textInverse', 'text'],
    ];
    for (const palette of Object.values(PALETTES)) {
      for (const [front, back] of contrasting) {
        expect(palette[front]).not.toBe(palette[back]);
      }
    }
  });

  it('keeps the four Bento tint families distinct per theme', () => {
    const light = Object.keys(TINTS).map((name) => tintFill(name as keyof typeof TINTS, 'light'));
    const dark = Object.keys(TINTS).map((name) => tintFill(name as keyof typeof TINTS, 'dark'));

    expect(Object.keys(TINTS)).toEqual(['blue', 'orange', 'green', 'grey']);
    expect(new Set(light).size).toBe(light.length);
    expect(new Set(dark).size).toBe(dark.length);
    expect(tintLine('blue', 'light')).not.toBe(tintLine('blue', 'dark'));
  });
});

describe('primitive tokens', () => {
  it('publishes every primitive as a --b- custom property', () => {
    const css = tokenDeclarations().join('\n');

    expect(css).toContain('--b-spacer-070: 16px;');
    expect(css).toContain('--b-radius-l: 12px;');
    expect(css).toContain('--b-duration-moderate: 150ms;');
    expect(css).toContain('--b-text-body-size: 14px;');
    expect(css).toContain('--b-text-caption-line-height: 18px;');
    expect(css).toContain('--b-z-navigation: 10;');
  });

  it('emits only well-formed declarations', () => {
    for (const line of tokenDeclarations()) {
      expect(line).toMatch(/^--b-[a-z0-9-]+: [^;]+;$/);
    }
  });

  it('layers modals and toasts above toolbars, and toolbars above the inspector', () => {
    expect(Z_INDEX.instantInteraction).toBeGreaterThan(Z_INDEX.navigation);
    expect(Z_INDEX.navigation).toBeGreaterThan(Z_INDEX.elevated);
  });
});

describe('stylesheets', () => {
  const roots = ['src/components', 'src/styles'];
  const sheets = roots.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => [join(dir, file), readFileSync(join(dir, file), 'utf8')] as const),
  );

  it('finds the stylesheets it means to check', () => {
    expect(sheets.length).toBeGreaterThan(10);
  });

  /**
   * An unknown custom property is not an error in CSS: the declaration is just
   * dropped, so a typo silently reverts an element to its unstyled size. This
   * caught `--b-z-instant-interaction` being emitted as `--b-z-instantInteraction`.
   */
  it('only references primitives that are actually emitted', () => {
    const emitted = new Set(tokenDeclarations().map((line) => line.slice(0, line.indexOf(':'))));
    for (const [path, css] of sheets) {
      for (const match of css.matchAll(/var\((--b-[a-z0-9-]+)/g)) {
        expect(emitted, `${path} references ${match[1]}`).toContain(match[1]);
      }
    }
  });

  it('leaves no uppercased or letter-spaced text, which Bento does not use', () => {
    for (const [path, css] of sheets) {
      expect(css, path).not.toMatch(/text-transform:\s*uppercase/);
      expect(css, path).not.toMatch(/letter-spacing:/);
    }
  });

  it('keeps frosted glass out of the design, since Bento surfaces are opaque', () => {
    for (const [path, css] of sheets) {
      expect(css, path).not.toMatch(/backdrop-filter/);
    }
  });
});

describe('canvas metrics', () => {
  it('builds every gap from the Bento spacer ramp', () => {
    const steps = new Set<number>(Object.values(SPACER));
    const gaps = [
      CARD.paddingX,
      CARD.paddingTop,
      CARD.paddingBottom,
      CARD.iconGap,
      CARD.terminalGap,
      CARD.chipGap,
      CARD.chipRowGap,
      CARD.methodGap,
      CARD.methodRowGap,
      CARD.badgeGap,
      TREE.siblingGap,
      TREE.rowGap,
      TREE.margin,
    ];
    for (const gap of gaps) expect(steps).toContain(gap);
  });

  it('takes card and chip radii from the Bento radius scale', () => {
    const radii = new Set<number>(Object.values(RADIUS));
    expect(radii).toContain(CARD.radius);
    expect(radii).toContain(CARD.chipRadius);
    expect(radii).toContain(CARD.methodRadius);
  });

  it('uses the Bento type scale for the name and the caption', () => {
    expect(CARD.nameSize).toBe(TYPE.bodyStrongest.size);
    expect(CARD.nameWeight).toBe(TYPE.bodyStrongest.weight);
    expect(CARD.captionSize).toBe(TYPE.caption.size);
    expect(CARD.captionLineHeight).toBe(TYPE.caption.lineHeight);
  });
});
