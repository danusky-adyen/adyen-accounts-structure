/**
 * Serialises a layout to standalone SVG.
 *
 * The previous version exported by screenshotting the live DOM with
 * html2canvas, which rasterised the diagram, mis-handled backdrop filters and
 * needed the on-screen zoom to be reset first. Drawing from the layout instead
 * gives a real vector file, needs no DOM and cannot be affected by the current
 * viewport.
 */

import { getIcon, getTerminalIcon, type IconDef } from '../design/icons';
import { PALETTES, TINTS, tintFill, type ThemeName } from '../design/palette';
import { specOf } from '../domain/kinds';
import type { Layout, LayoutNode } from '../layout';
import { FONT_STACK } from '../layout/measure';
import { CARD } from '../layout/metrics';

export interface SvgExportOptions {
  readonly theme: ThemeName;
  /** Paint the canvas colour behind the diagram. */
  readonly background: boolean;
  readonly title: string;
}

const ICON_INSET = 3;
/** Attribute-safe copy of the font stack. */
const FONT_ATTR = escapeXml(FONT_STACK);

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function iconMarkup(def: IconDef, size: number, x: number, y: number, lineColor: string, fillColor: string): string {
  const viewBoxSize = Number.parseFloat(def.viewBox.split(' ')[2] ?? '48');
  const scale = size / viewBoxSize;
  const shapes = def.shapes
    .map((shape) => {
      if (shape.role === 'fill') return `<path d="${shape.d}" fill="${fillColor}"/>`;
      if (shape.role === 'solid') return `<path d="${shape.d}" fill="${lineColor}"/>`;
      return `<path d="${shape.d}" fill="none" stroke="${lineColor}" stroke-width="${shape.width ?? 2}" stroke-linecap="${shape.linecap ?? 'butt'}" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale, 4)})">${shapes}</g>`;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function cardMarkup(item: LayoutNode, theme: ThemeName): string {
  const palette = PALETTES[theme];
  const spec = specOf(item.kind);
  const tint = TINTS[spec.tint];
  const fill = tintFill(spec.tint, theme);
  const { slots } = item;

  const surface =
    spec.tone === 'management'
      ? palette.surfaceSunken
      : item.insidePlatform
        ? mix(palette.accent, palette.surface, 0.04)
        : palette.surface;

  const parts: string[] = [
    `<rect x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}" rx="${CARD.radius}" fill="${surface}" stroke="${palette.border}" stroke-width="1"/>`,
    `<rect x="${round(item.x + slots.icon.x)}" y="${round(item.y + slots.icon.y)}" width="${round(slots.icon.width)}" height="${round(slots.icon.height)}" rx="12" fill="${fill}"/>`,
    iconMarkup(
      getIcon(spec.icon),
      CARD.iconSize - ICON_INSET * 2,
      item.x + slots.icon.x + ICON_INSET,
      item.y + slots.icon.y + ICON_INSET,
      tint.line,
      fill,
    ),
  ];

  const centerX = item.x + item.width / 2;

  item.nameLines.forEach((line, index) => {
    const y = item.y + slots.nameTop + slots.nameLineHeight / 2 + index * slots.nameLineHeight;
    parts.push(
      `<text x="${round(centerX)}" y="${round(y)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.nameSize}" font-weight="${CARD.nameWeight}" fill="${palette.text}">${escapeXml(line)}</text>`,
    );
  });

  parts.push(
    `<text x="${round(centerX)}" y="${round(item.y + slots.captionBaselineTop + CARD.captionLineHeight / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.captionSize}" font-weight="${CARD.captionWeight}" letter-spacing="0.55" fill="${palette.textFaint}">${escapeXml(item.caption.toUpperCase())}</text>`,
  );

  if (item.node.note.trim() !== '') {
    parts.push(
      `<circle cx="${round(item.x + item.width - 15)}" cy="${round(item.y + 15)}" r="3" fill="${palette.textFaint}"/>`,
    );
  }

  const terminals = item.node.terminals;
  if (slots.terminalsTop !== null && terminals.length > 0) {
    const totalWidth = terminals.length * CARD.terminalSize + (terminals.length - 1) * CARD.terminalSpacing;
    let cursor = item.x + (item.width - totalWidth) / 2;
    const top = item.y + slots.terminalsTop + (CARD.terminalRowHeight - CARD.terminalSize) / 2;
    for (const terminal of terminals) {
      parts.push(
        `<rect x="${round(cursor)}" y="${round(top)}" width="${CARD.terminalSize}" height="${CARD.terminalSize}" rx="7" fill="${palette.surfaceSunken}" stroke="${palette.border}"/>`,
        iconMarkup(getTerminalIcon(terminal), CARD.terminalSize - 6, cursor + 3, top + 3, tint.line, fill),
      );
      cursor += CARD.terminalSize + CARD.terminalSpacing;
    }
  }

  return `<g>${parts.join('')}</g>`;
}

export function renderDiagramSvg(layout: Layout, options: SvgExportOptions): string {
  const palette = PALETTES[options.theme];
  const { bounds } = layout;

  const edges = layout.edges
    .map(
      (edge) =>
        `<path d="${edge.path}" fill="none" stroke="${palette.edge}" stroke-width="1.75" stroke-linecap="round"/>`,
    )
    .join('');

  const links = layout.links
    .map(
      (link) =>
        `<path d="${link.path}" fill="none" stroke="${palette.linkEdge}" stroke-width="1.75" stroke-dasharray="5 5" stroke-linecap="round"/>`,
    )
    .join('');

  const cards = layout.nodes.map((item) => cardMarkup(item, options.theme)).join('');
  const background = options.background
    ? `<rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="${palette.canvas}"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}">`,
    `<title>${escapeXml(options.title)}</title>`,
    background,
    `<g>${edges}${links}</g>`,
    cards,
    '</svg>',
  ].join('');
}

function mix(color: string, base: string, amount: number): string {
  const a = parseHex(color);
  const b = parseHex(base);
  if (!a || !b) return base;
  const channels = a.map((value, index) => Math.round(value * amount + (b[index] ?? 0) * (1 - amount)));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match?.[1]) return null;
  const int = Number.parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
