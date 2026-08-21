/** Shared geometry helpers for orthogonal edge routing. */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function rectCenterX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

export function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

export function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Builds an SVG path through the given points using rounded corners. Points
 * must describe an axis-aligned polyline, which is what every edge in the
 * diagram is.
 */
export function roundedPolyline(points: readonly Point[], radius: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${round(first.x)} ${round(first.y)}`;

  let path = `M ${round(first.x)} ${round(first.y)}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (!previous || !corner || !next) continue;

    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);

    if (r < 0.5) {
      path += ` L ${round(corner.x)} ${round(corner.y)}`;
      continue;
    }

    const inUnit = { x: (corner.x - previous.x) / inLength, y: (corner.y - previous.y) / inLength };
    const outUnit = { x: (next.x - corner.x) / outLength, y: (next.y - corner.y) / outLength };
    const entry = { x: corner.x - inUnit.x * r, y: corner.y - inUnit.y * r };
    const exit = { x: corner.x + outUnit.x * r, y: corner.y + outUnit.y * r };

    path += ` L ${round(entry.x)} ${round(entry.y)}`;
    path += ` Q ${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`;
  }

  const last = points[points.length - 1];
  if (last) path += ` L ${round(last.x)} ${round(last.y)}`;
  return path;
}

export function horizontalBezier(from: Point, to: Point): string {
  const midX = (from.x + to.x) / 2;
  return `M ${round(from.x)} ${round(from.y)} C ${round(midX)} ${round(from.y)}, ${round(midX)} ${round(to.y)}, ${round(to.x)} ${round(to.y)}`;
}

export function unionRect(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Packs intervals into lanes so that overlapping intervals never share one.
 * Used to keep cross-link channels from being drawn on top of each other.
 */
export function assignLanes(intervals: readonly { min: number; max: number }[]): number[] {
  const laneEnds: number[] = [];
  const order = intervals
    .map((interval, index) => ({ interval, index }))
    .sort((a, b) => a.interval.min - b.interval.min || a.interval.max - b.interval.max);

  const lanes = new Array<number>(intervals.length).fill(0);
  for (const { interval, index } of order) {
    let lane = laneEnds.findIndex((end) => end <= interval.min);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(interval.max);
    } else {
      laneEnds[lane] = interval.max;
    }
    lanes[index] = lane;
  }
  return lanes;
}
