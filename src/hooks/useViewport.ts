import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Layout } from '../layout';
import type { Point } from '../layout/geometry';
import { useStore } from '../state/store';
import { getViewport, setViewport } from '../state/viewport';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2.5;
const FIT_MAX_SCALE = 1.15;
/** Space the floating toolbars occupy, so fitting never hides a card behind one. */
const FIT_INSETS = { top: 92, right: 56, bottom: 84, left: 56 };
const INSPECTOR_WIDTH = 344;

/**
 * One object for the lifetime of the canvas. It reads the viewport and the
 * layout when called rather than closing over them, so nothing that holds it
 * re-renders or re-subscribes when you pan.
 */
export interface ViewportController {
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

/** The inspector floats over the canvas, so a card behind it is as good as off-screen. */
function rightInset(width: number, fallback: number): number {
  return useStore.getState().inspectorOpen && width > 900 ? INSPECTOR_WIDTH : fallback;
}

/**
 * Owns pan and zoom for the canvas: wheel and trackpad gestures, the toolbar
 * buttons and fit-to-content all go through one place, and screen coordinates
 * are converted here so interaction code never repeats the maths.
 */
export function useViewport(containerRef: RefObject<HTMLElement | null>, layout: Layout): ViewportController {
  const layoutRef = useRef(layout);
  // A layout effect, so a fit requested right after an edit already sees it.
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const controller = useMemo((): ViewportController & { zoomAround: (scale: number, focus: Point) => void } => {
    const bounds = (): DOMRect | undefined => containerRef.current?.getBoundingClientRect();

    const zoomAround = (nextScale: number, focus: Point): void => {
      const current = getViewport();
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (scale === current.scale) return;
      const ratio = scale / current.scale;
      setViewport({
        scale,
        x: focus.x - (focus.x - current.x) * ratio,
        y: focus.y - (focus.y - current.y) * ratio,
      });
    };

    const centre = (): Point => {
      const rect = bounds();
      return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
    };

    return {
      zoomAround,

      toCanvas: (clientX, clientY) => {
        const rect = bounds();
        const current = getViewport();
        return {
          x: (clientX - (rect?.left ?? 0) - current.x) / current.scale,
          y: (clientY - (rect?.top ?? 0) - current.y) / current.scale,
        };
      },

      zoomBy: (factor) => zoomAround(getViewport().scale * factor, centre()),
      zoomTo: (scale) => zoomAround(scale, centre()),

      panBy: (dx, dy) => {
        const current = getViewport();
        setViewport({ ...current, x: current.x + dx, y: current.y + dy });
      },

      fit: () => {
        const rect = bounds();
        if (!rect || rect.width === 0) return;
        const { content } = layoutRef.current;
        if (content.width === 0 || content.height === 0) return;

        const availableWidth = Math.max(120, rect.width - FIT_INSETS.left - rightInset(rect.width, FIT_INSETS.right));
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
      },

      reveal: (nodeId) => {
        const rect = bounds();
        const item = layoutRef.current.byId.get(nodeId);
        if (!rect || !item) return;

        const current = getViewport();
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

      isVisible: (nodeId) => {
        const rect = bounds();
        const item = layoutRef.current.byId.get(nodeId);
        if (!rect || !item) return true;

        const current = getViewport();
        const padding = 24;
        const rightEdge = rect.width - rightInset(rect.width, padding);

        const left = item.x * current.scale + current.x;
        const top = item.y * current.scale + current.y;
        return (
          left >= padding &&
          top >= padding &&
          left + item.width * current.scale <= rightEdge &&
          top + item.height * current.scale <= rect.height - padding
        );
      },
    };
  }, [containerRef]);

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
        controller.zoomAround(getViewport().scale * Math.exp(-event.deltaY * 0.01), focus);
        return;
      }
      controller.panBy(-event.deltaX, -event.deltaY);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [containerRef, controller]);

  return controller;
}
