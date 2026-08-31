import { useCallback, useEffect, useMemo, type RefObject } from 'react';
import type { Layout } from '../layout';
import type { Point } from '../layout/geometry';
import { useStore, type Viewport } from '../state/store';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2.5;
const FIT_MAX_SCALE = 1.15;
/** Space the floating toolbars occupy, so fitting never hides a card behind one. */
const FIT_INSETS = { top: 92, right: 56, bottom: 84, left: 56 };
const INSPECTOR_WIDTH = 344;

export interface ViewportController {
  readonly viewport: Viewport;
  readonly fit: () => void;
  readonly zoomBy: (factor: number) => void;
  readonly zoomTo: (scale: number) => void;
  readonly toCanvas: (clientX: number, clientY: number) => Point;
  readonly panBy: (dx: number, dy: number) => void;
  /** Pans the smallest amount that brings a node fully into view. */
  readonly reveal: (nodeId: string) => void;
  /**
   * Whether a node is fully inside the visible part of the canvas. Unknown ids
   * count as visible: there is nothing to bring into view.
   */
  readonly isVisible: (nodeId: string) => boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Owns pan and zoom for the canvas: wheel and trackpad gestures, the toolbar
 * buttons and fit-to-content all go through one place, and screen coordinates
 * are converted here so interaction code never repeats the maths.
 */
export function useViewport(containerRef: RefObject<HTMLElement | null>, layout: Layout): ViewportController {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);

  const toCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      const current = useStore.getState().viewport;
      const originX = rect?.left ?? 0;
      const originY = rect?.top ?? 0;
      return {
        x: (clientX - originX - current.x) / current.scale,
        y: (clientY - originY - current.y) / current.scale,
      };
    },
    [containerRef],
  );

  const zoomAround = useCallback(
    (nextScale: number, focus: Point) => {
      const current = useStore.getState().viewport;
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (scale === current.scale) return;
      const ratio = scale / current.scale;
      setViewport({
        scale,
        x: focus.x - (focus.x - current.x) * ratio,
        y: focus.y - (focus.y - current.y) * ratio,
      });
    },
    [setViewport],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const focus = { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
      zoomAround(useStore.getState().viewport.scale * factor, focus);
    },
    [containerRef, zoomAround],
  );

  const zoomTo = useCallback(
    (scale: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const focus = { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
      zoomAround(scale, focus);
    },
    [containerRef, zoomAround],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const current = useStore.getState().viewport;
      setViewport({ ...current, x: current.x + dx, y: current.y + dy });
    },
    [setViewport],
  );

  const fit = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const { content } = layout;
    if (content.width === 0 || content.height === 0) return;

    const rightInset =
      useStore.getState().inspectorOpen && rect.width > 900 ? INSPECTOR_WIDTH : FIT_INSETS.right;
    const availableWidth = Math.max(120, rect.width - FIT_INSETS.left - rightInset);
    const availableHeight = Math.max(120, rect.height - FIT_INSETS.top - FIT_INSETS.bottom);

    const scale = clamp(
      Math.min(availableWidth / content.width, availableHeight / content.height),
      MIN_SCALE,
      FIT_MAX_SCALE,
    );

    const scaledHeight = content.height * scale;
    setViewport({
      scale,
      x: FIT_INSETS.left + (availableWidth - content.width * scale) / 2 - content.x * scale,
      y:
        scaledHeight <= availableHeight
          ? FIT_INSETS.top + (availableHeight - scaledHeight) / 2 - content.y * scale
          : FIT_INSETS.top - content.y * scale,
    });
  }, [containerRef, layout, setViewport]);

  const reveal = useCallback(
    (nodeId: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const item = layout.byId.get(nodeId);
      if (!rect || !item) return;

      const current = useStore.getState().viewport;
      const left = item.x * current.scale + current.x;
      const top = item.y * current.scale + current.y;
      const right = left + item.width * current.scale;
      const bottom = top + item.height * current.scale;
      const padding = 48;

      let dx = 0;
      let dy = 0;
      if (left < padding) dx = padding - left;
      else if (right > rect.width - padding) dx = Math.max(rect.width - padding - right, padding - left);
      if (top < padding) dy = padding - top;
      else if (bottom > rect.height - padding) dy = Math.max(rect.height - padding - bottom, padding - top);

      if (dx !== 0 || dy !== 0) setViewport({ ...current, x: current.x + dx, y: current.y + dy });
    },
    [containerRef, layout, setViewport],
  );

  const isVisible = useCallback(
    (nodeId: string): boolean => {
      const rect = containerRef.current?.getBoundingClientRect();
      const item = layout.byId.get(nodeId);
      if (!rect || !item) return true;

      const current = useStore.getState().viewport;
      const padding = 24;
      // The inspector floats over the canvas, so a card behind it is as good as
      // off-screen.
      const rightEdge =
        rect.width -
        (useStore.getState().inspectorOpen && rect.width > 900 ? INSPECTOR_WIDTH : padding);

      const left = item.x * current.scale + current.x;
      const top = item.y * current.scale + current.y;
      return (
        left >= padding &&
        top >= padding &&
        left + item.width * current.scale <= rightEdge &&
        top + item.height * current.scale <= rect.height - padding
      );
    },
    [containerRef, layout],
  );

  // Wheel needs a non-passive listener to be able to prevent the page from
  // scrolling, which React's onWheel cannot provide.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const focus = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01);
        zoomAround(useStore.getState().viewport.scale * factor, focus);
        return;
      }

      const current = useStore.getState().viewport;
      setViewport({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY });
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [containerRef, setViewport, zoomAround]);

  return useMemo(
    () => ({ viewport, fit, zoomBy, zoomTo, toCanvas, panBy, reveal, isVisible }),
    [viewport, fit, zoomBy, zoomTo, toCanvas, panBy, reveal, isVisible],
  );
}
