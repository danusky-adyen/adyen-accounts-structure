import { useEffect, useRef } from 'react';
import type { Layout } from '../layout';
import type { ViewportController } from './useViewport';

/**
 * Keeps cards you have just created on screen.
 *
 * A structure grows past the edge of the window quickly, and a card added
 * outside the visible area reads as a card that was never added at all. So when
 * new nodes appear, the view pans the smallest amount that brings them back,
 * and falls back to fitting the whole diagram when panning alone cannot.
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

    const added = [...ids].filter((id) => !known.has(id));
    if (added.length === 0) return;

    const controller = viewRef.current;
    const hidden = added.filter((id) => !controller.isVisible(id));
    if (hidden.length === 0) return;

    if (hidden.length === 1) {
      const [only] = hidden as [string];
      controller.reveal(only);
      if (controller.isVisible(only)) return;
    }

    controller.fit();
  }, [layout]);
}
