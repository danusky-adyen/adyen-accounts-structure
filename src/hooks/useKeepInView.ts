import { useEffect, useRef } from 'react';
import type { Layout } from '../layout';
import type { ViewportController } from './useViewport';

/**
 * Keeps cards you have just created on screen.
 *
 * A structure grows past the edge of the window quickly, and a card added
 * outside the visible area reads as a card that was never added at all. So when
 * new nodes appear, the view pans the smallest amount that brings them back.
 *
 * Panning only, never zooming: if you have zoomed in to work on one corner, a
 * new card must not throw you back out to the whole diagram. Fitting is left to
 * the things that genuinely replace what you are looking at — opening the tool,
 * importing, starting over — and to ⌘0.
 *
 * Only *new* nodes trigger it: moving, renaming or editing a card leaves the
 * view exactly where you put it.
 */
export function useKeepInView(layout: Layout, view: ViewportController): void {
  const knownRef = useRef<ReadonlySet<string> | null>(null);
  // The controller is rebuilt on every pan; holding it in a ref keeps this
  // effect firing on layout changes alone.
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const known = knownRef.current;
    const ids = new Set(layout.nodes.map((node) => node.id));
    knownRef.current = ids;

    // The first layout belongs to the initial fit.
    if (known === null) return;

    const controller = viewRef.current;
    // Layout order, so a run of additions pans to the first new card rather
    // than whichever one the diff happened to yield first.
    const hidden = layout.nodes.find((node) => !known.has(node.id) && !controller.isVisible(node.id));
    if (hidden) controller.reveal(hidden.id);
  }, [layout]);
}
