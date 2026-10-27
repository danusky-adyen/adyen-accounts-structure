/**
 * Motion helpers shared by the intro and the tile transitions. Cards move with
 * the Web Animations API and connectors are tweened by hand, so both read the
 * same curve from here and stay glued together while they move.
 */

export type Easing = (t: number) => number;

/**
 * The CSS `cubic-bezier()` timing function, solved for x with Newton's method
 * and bisection as a fallback, so a JS tween can follow a CSS animation.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solve = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    while (high - low > 1e-6) {
      if (sampleX(t) < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return t;
  };

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)));
}

/** A glide that settles softly: used for every card move and connector. */
export const MOVE_CURVE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
export const moveEase = cubicBezier(0.25, 0.8, 0.25, 1);
export const MOVE_MS = 320;

/** Arrivals overshoot a touch, so a new card reads as popping into place. */
export const ENTER_CURVE = 'cubic-bezier(0.2, 0.9, 0.3, 1.12)';
export const ENTER_MS = 340;

export const EXIT_CURVE = 'cubic-bezier(0.4, 0, 0.9, 0.6)';
export const EXIT_MS = 220;

export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeOutBack: Easing = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Progress through a window that starts `delay` ms in and lasts `duration`. */
export function progress(elapsed: number, delay: number, duration: number): number {
  return clamp01((elapsed - delay) / duration);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

export interface PathShape {
  /** The commands and separators around the numbers. */
  readonly skeleton: readonly string[];
  readonly numbers: readonly number[];
}

export function parsePath(path: string): PathShape {
  return { skeleton: path.split(NUMBER), numbers: (path.match(NUMBER) ?? []).map(Number) };
}

/**
 * A function from 0..1 to a path between two others, or null when they are
 * drawn with different commands and cannot be blended number by number.
 */
export function pathTween(from: string, to: string): ((t: number) => string) | null {
  const a = parsePath(from);
  const b = parsePath(to);
  if (a.numbers.length !== b.numbers.length || a.skeleton.join('#') !== b.skeleton.join('#')) return null;
  return (t) => {
    let out = b.skeleton[0] ?? '';
    for (let i = 0; i < b.numbers.length; i += 1) {
      const value = lerp(a.numbers[i] ?? 0, b.numbers[i] ?? 0, t);
      out += String(Math.round(value * 100) / 100) + (b.skeleton[i + 1] ?? '');
    }
    return out;
  };
}
