/**
 * Text measurement for the layout engine. Injected rather than imported
 * directly so the layout stays a pure function that can run in tests without a
 * DOM.
 */

import { FONT, type FontFamily } from '../design/tokens';

export type TextMeasurer = (text: string, weight: number, size: number, family?: FontFamily) => number;

export const FONT_STACK = FONT.sans;
export const MONO_STACK = FONT.mono;

/** Cheap approximation used in tests and before a canvas is available. */
export const estimateTextWidth: TextMeasurer = (text, weight, size, family = 'sans') => {
  const factor = family === 'mono' ? 0.6 : weight >= 600 ? 0.58 : 0.54;
  return text.length * size * factor;
};

/**
 * Real measurement through a cached offscreen 2D context. Results are memoised
 * per font/text pair because layout runs on every document change.
 */
export function createCanvasMeasurer(): TextMeasurer {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const context = canvas?.getContext('2d') ?? null;
  if (!context) return estimateTextWidth;

  const cache = new Map<string, number>();
  return (text, weight, size, family = 'sans') => {
    const key = `${family}|${weight}|${size}|${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    context.font = `${weight} ${size}px ${FONT[family]}`;
    const width = context.measureText(text).width;
    if (cache.size > 4000) cache.clear();
    cache.set(key, width);
    return width;
  };
}

export interface WrapResult {
  readonly lines: readonly string[];
  readonly width: number;
}

/**
 * Greedy word wrap limited to `maxLines`. The last line is ellipsised when the
 * text does not fit, so a pasted paragraph cannot stretch a card.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: TextMeasurer,
  weight: number,
  size: number,
): WrapResult {
  const words = text.split(' ').filter((word) => word !== '');
  if (words.length === 0) return { lines: [''], width: 0 };

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measure(candidate, weight, size) <= maxWidth || current === '') {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current !== '') lines.push(current);

  if (lines.length === maxLines) {
    const overflowed = words.join(' ') !== lines.join(' ');
    const last = lines[maxLines - 1] ?? '';
    if (overflowed || measure(last, weight, size) > maxWidth) {
      lines[maxLines - 1] = ellipsise(last, maxWidth, measure, weight, size);
    }
  }

  const width = lines.reduce((widest, line) => Math.max(widest, measure(line, weight, size)), 0);
  return { lines, width };
}

function ellipsise(
  text: string,
  maxWidth: number,
  measure: TextMeasurer,
  weight: number,
  size: number,
): string {
  if (measure(`${text}…`, weight, size) <= maxWidth) return `${text}…`;
  let trimmed = text;
  while (trimmed.length > 1 && measure(`${trimmed}…`, weight, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}…`;
}
