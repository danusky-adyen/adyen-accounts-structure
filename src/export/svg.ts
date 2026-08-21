/**
 * Serialises a layout to standalone SVG.
 *
 * The previous version exported by screenshotting the live DOM with
 * html2canvas, which rasterised the diagram, mis-handled backdrop filters and
 * needed the on-screen zoom to be reset first. Drawing from the layout instead
 * gives a real vector file, needs no DOM and cannot be affected by the current
 * viewport.
 */

import { monogram, peekCompanyLogo, peekPaymentLogos } from '../design/brand';
import { getIcon, getTerminalIcon, type IconDef } from '../design/icons';
import { PALETTES, TINTS, tintFill, type ThemeName } from '../design/palette';
import { BORDER_WIDTH, RADIUS, TYPE } from '../design/tokens';
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
        ? palette.highlightSoft
        : palette.surface;

  const parts: string[] = [
    `<rect x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}" rx="${CARD.radius}" fill="${surface}" stroke="${palette.border}" stroke-width="${BORDER_WIDTH.s}"/>`,
    `<rect x="${round(item.x + slots.icon.x)}" y="${round(item.y + slots.icon.y)}" width="${round(slots.icon.width)}" height="${round(slots.icon.height)}" rx="${RADIUS.m}" fill="${fill}"/>`,
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

  if (slots.logo !== null) {
    // The brand tile covers the kind glyph drawn above, so the glyph is redrawn
    // small in the corner exactly as the card does it.
    const box = { x: item.x + slots.logo.x, y: item.y + slots.logo.y };
    parts.push(
      `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(slots.logo.width)}" height="${round(slots.logo.height)}" rx="${RADIUS.m}" fill="${palette.surface}"/>`,
    );

    const logo = peekCompanyLogo(item.node.logoDomain);
    if (logo === null) {
      parts.push(
        `<text x="${round(box.x + slots.logo.width / 2)}" y="${round(box.y + slots.logo.height / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="15" font-weight="${TYPE.title.weight}" fill="${tint.line}">${escapeXml(monogram(item.node.name))}</text>`,
      );
    } else {
      parts.push(
        `<image x="${round(box.x + 3)}" y="${round(box.y + 3)}" width="${round(slots.logo.width - 6)}" height="${round(slots.logo.height - 6)}" href="${escapeXml(logo)}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    }

    const glyph = CARD.logoKindSize;
    parts.push(
      `<rect x="${round(box.x + slots.logo.width - glyph + 5)}" y="${round(box.y + slots.logo.height - glyph + 5)}" width="${glyph}" height="${glyph}" rx="${RADIUS.s}" fill="${fill}" stroke="${palette.surface}"/>`,
      iconMarkup(
        getIcon(spec.icon),
        glyph - 3,
        box.x + slots.logo.width - glyph + 6.5,
        box.y + slots.logo.height - glyph + 6.5,
        tint.line,
        fill,
      ),
    );
  }

  item.nameLines.forEach((line, index) => {
    const y = item.y + slots.nameTop + slots.nameLineHeight / 2 + index * slots.nameLineHeight;
    parts.push(
      `<text x="${round(centerX)}" y="${round(y)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.nameSize}" font-weight="${CARD.nameWeight}" fill="${palette.text}">${escapeXml(line)}</text>`,
    );
  });

  parts.push(
    `<text x="${round(centerX)}" y="${round(item.y + slots.captionBaselineTop + CARD.captionLineHeight / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.captionSize}" font-weight="${CARD.captionWeight}" fill="${palette.textMuted}">${escapeXml(item.caption)}</text>`,
  );

  if (item.node.note.trim() !== '') {
    parts.push(
      `<circle cx="${round(item.x + item.width - 15)}" cy="${round(item.y + 15)}" r="3" fill="${palette.textFaint}"/>`,
    );
  }

  for (const chip of slots.chips) {
    parts.push(
      `<rect x="${round(item.x + chip.x)}" y="${round(item.y + chip.y)}" width="${round(chip.width)}" height="${round(chip.height)}" rx="${CARD.chipRadius}" fill="${palette.surfaceSunken}" stroke="${palette.border}"/>`,
      `<text x="${round(item.x + chip.x + chip.width / 2)}" y="${round(item.y + chip.y + chip.height / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.chipTextSize}" font-weight="${CARD.chipTextWeight}" fill="${palette.textMuted}">${escapeXml(chip.label)}</text>`,
    );
  }

  // Vendored artwork, so a method mark survives an export with no network.
  const logos = peekPaymentLogos();
  for (const box of slots.methods) {
    const logo = logos?.[box.method];
    parts.push(
      `<rect x="${round(item.x + box.x)}" y="${round(item.y + box.y)}" width="${round(box.width)}" height="${round(box.height)}" rx="${CARD.methodRadius}" fill="${palette.surfaceSunken}"/>`,
    );
    if (logo) {
      parts.push(
        `<svg x="${round(item.x + box.x)}" y="${round(item.y + box.y)}" width="${round(box.width)}" height="${round(box.height)}" viewBox="${logo.viewBox}" preserveAspectRatio="xMidYMid meet">${stripSvgWrapper(logo.svg)}</svg>`,
      );
    }
  }

  if (slots.methodOverflowBox !== null) {
    const box = slots.methodOverflowBox;
    parts.push(
      `<rect x="${round(item.x + box.x)}" y="${round(item.y + box.y)}" width="${round(box.width)}" height="${round(box.height)}" rx="${CARD.methodRadius}" fill="${palette.surfaceSunken}" stroke="${palette.border}"/>`,
      `<text x="${round(item.x + box.x + box.width / 2)}" y="${round(item.y + box.y + box.height / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="10" font-weight="${TYPE.captionStronger.weight}" fill="${palette.textFaint}">+${slots.methodOverflow}</text>`,
    );
  }

  if (slots.badgeTop !== null) {
    parts.push(
      `<text x="${round(centerX)}" y="${round(item.y + slots.badgeTop + CARD.badgeHeight / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_ATTR}" font-size="${CARD.badgeTextSize}" font-weight="${CARD.badgeTextWeight}" fill="${palette.textMuted}">${escapeXml(slots.badgeLabel)}</text>`,
    );
  }

  const terminals = item.node.terminals;
  if (slots.terminalsTop !== null && terminals.length > 0) {
    const totalWidth = terminals.length * CARD.terminalSize + (terminals.length - 1) * CARD.terminalSpacing;
    let cursor = item.x + (item.width - totalWidth) / 2;
    const top = item.y + slots.terminalsTop + (CARD.terminalRowHeight - CARD.terminalSize) / 2;
    for (const terminal of terminals) {
      parts.push(
        `<rect x="${round(cursor)}" y="${round(top)}" width="${CARD.terminalSize}" height="${CARD.terminalSize}" rx="${RADIUS.s}" fill="${palette.surfaceSunken}" stroke="${palette.border}"/>`,
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

/**
 * Unwraps a vendored logo so its shapes can be nested inside the diagram. The
 * outer `<svg>` is replaced by the caller's own, which is what positions and
 * scales the artwork.
 */
function stripSvgWrapper(svg: string): string {
  const opening = svg.indexOf('>');
  const closing = svg.lastIndexOf('</svg>');
  if (opening === -1 || closing === -1 || closing < opening) return '';
  return svg.slice(opening + 1, closing);
}

