import { useEffect, useRef } from 'react';
import type { Layout } from '../layout';
import type { ViewportController } from './useViewport';

/**
 * Keeps cards you have just created on screen, unless you are working on the
 * card they were added to.
 *
 * A card added outside the visible area can read as a card that was never
 * added, so when new nodes appear off-screen the view pans the smallest amount
 * that brings them back. But when the card they were added under is on screen,
 * that is where the pointer is: the layout pins it in place (`layout/anchor.ts`)
 * so its + button stays under the pointer for the next click, and panning to a
 * new card at the far edge would undo exactly that. The view stays put, and the
 * new card is one pan away beside the card it belongs to.
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

  useEffect(() => {
    const known = knownRef.current;
    const ids = new Set(layout.nodes.map((node) => node.id));
    knownRef.current = ids;

    // The first layout belongs to the initial fit.
    if (known === null) return;

    const hidden = cardToReveal(layout, known, view.isVisible);
    if (hidden !== null) view.reveal(hidden);
  }, [layout, view]);
}

/**
 * The first new card, in layout order, that is off-screen while the card it
 * was added under is off-screen too. Layout order, so a run of additions pans
 * to the first new card rather than whichever one the diff yielded first.
 */
export function cardToReveal(
  layout: Layout,
  known: ReadonlySet<string>,
  isVisible: (nodeId: string, partly?: boolean) => boolean,
): string | null {
  const hidden = layout.nodes.find(
    (node) =>
      !known.has(node.id) &&
      !isVisible(node.id) &&
      !(node.parentId !== null && known.has(node.parentId) && isVisible(node.parentId, true)),
  );
  return hidden?.id ?? null;
}
