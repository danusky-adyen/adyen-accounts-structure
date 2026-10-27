import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { NodeId } from '../domain/document';
import {
  ENTER_CURVE,
  ENTER_MS,
  EXIT_CURVE,
  EXIT_MS,
  MOVE_CURVE,
  MOVE_MS,
  moveEase,
  pathTween,
  prefersReducedMotion,
} from '../design/motion';
import type { Layout } from '../layout';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Snapshot {
  readonly nodes: ReadonlyMap<NodeId, Box>;
  readonly paths: ReadonlyMap<string, string>;
}

interface PathTween {
  readonly element: SVGPathElement;
  readonly at: (t: number) => string;
  readonly final: string;
  readonly start: number;
}

export interface TileMotionRefs {
  readonly tree: RefObject<HTMLElement | null>;
  readonly edges: RefObject<HTMLElement | null>;
  /** Where cards that were just removed play out their exit. */
  readonly ghostCards: RefObject<HTMLElement | null>;
  readonly ghostEdges: RefObject<SVGGElement | null>;
}

/** More removals than this at once (a big undo) simply vanish. */
const MAX_GHOSTS = 60;

function snapshot(layout: Layout): Snapshot {
  const paths = new Map<string, string>();
  for (const edge of layout.edges) paths.set(`edge:${edge.id}`, edge.path);
  for (const link of layout.links) paths.set(`link:${link.id}`, link.path);
  return {
    nodes: new Map(
      layout.nodes.map((item) => [item.id, { x: item.x, y: item.y, width: item.width, height: item.height }]),
    ),
    paths,
  };
}

/** The offset a card is drawn at right now, mid-animation or not. */
function currentTranslate(element: HTMLElement): { x: number; y: number } {
  const value = getComputedStyle(element).translate;
  if (!value || value === 'none') return { x: 0, y: 0 };
  const [x = '0', y = '0'] = value.split(' ');
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

/**
 * Softens every change to the diagram. New and removed cards simply fade in or
 * out where they stand, and cards that shift glide to their new
 * place (FLIP: the DOM jumps, then an animation plays the jump back from where
 * it was). Connectors are tweened on the same curve every frame, so they stay
 * attached to the cards while they move. Nothing runs while `suspended`.
 */
export function useTileMotion(layout: Layout, refs: TileMotionRefs, suspended: boolean): void {
  const previous = useRef<Snapshot | null>(null);
  const cardElements = useRef(new Map<NodeId, HTMLElement>());
  const pathElements = useRef(new Map<string, SVGPathElement>());
  const motions = useRef(new WeakMap<Element, Animation>());
  const displayed = useRef(new Map<string, string>());
  const tweens = useRef(new Map<string, PathTween>());
  const frame = useRef(0);

  useLayoutEffect(() => {
    const tree = refs.tree.current;
    const edgeLayer = refs.edges.current;
    if (!tree || !edgeLayer) return;

    const cards = new Map<NodeId, HTMLElement>();
    for (const element of tree.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const id = element.dataset['nodeId'];
      if (id) cards.set(id, element);
    }
    const paths = new Map<string, SVGPathElement>();
    for (const element of edgeLayer.querySelectorAll<SVGPathElement>('path[data-path]')) {
      const id = element.dataset['path'];
      if (id) paths.set(id, element);
    }

    const before = previous.current;
    const after = snapshot(layout);
    const oldCards = cardElements.current;
    const oldPaths = pathElements.current;
    previous.current = after;
    cardElements.current = cards;
    pathElements.current = paths;

    if (before === null || suspended || prefersReducedMotion()) {
      cancelAnimationFrame(frame.current);
      tweens.current.clear();
      displayed.current.clear();
      return;
    }

    const animate = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation => {
      motions.current.get(element)?.cancel();
      const animation = element.animate(keyframes, options);
      motions.current.set(element, animation);
      return animation;
    };

    // Cards that stayed glide from where they were; new ones fade in where they land.
    for (const [id, element] of cards) {
      const box = after.nodes.get(id);
      if (!box) continue;
      const was = before.nodes.get(id);

      if (!was) {
        animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_MS, easing: ENTER_CURVE });
        continue;
      }

      const running = motions.current.get(element)?.playState === 'running';
      const carried = running ? currentTranslate(element) : { x: 0, y: 0 };
      const dx = was.x - box.x + carried.x;
      const dy = was.y - box.y + carried.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      animate(element, [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
        duration: MOVE_MS,
        easing: MOVE_CURVE,
      });
    }

    // Removed cards are no longer React's: the detached element plays its exit
    // in the ghost layer, fading out where it stood.
    const ghosts = refs.ghostCards.current;
    let ghostCount = 0;
    for (const [id, element] of oldCards) {
      if (cards.has(id) || element.isConnected || !ghosts || ghostCount >= MAX_GHOSTS) continue;
      if (!before.nodes.has(id)) continue;

      ghostCount += 1;
      element.removeAttribute('data-node-id');
      element.removeAttribute('tabindex');
      ghosts.appendChild(element);
      const exit = animate(element, [{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_MS,
        easing: EXIT_CURVE,
        fill: 'forwards',
      });
      exit.onfinish = () => element.remove();
      exit.oncancel = () => element.remove();
    }

    // Connectors: new ones fade in, changed ones tween, removed ones fade out.
    const now = performance.now();
    for (const [id, element] of paths) {
      const final = after.paths.get(id);
      if (final === undefined) continue;
      const shown = displayed.current.get(id) ?? before.paths.get(id);

      if (shown === undefined) {
        tweens.current.delete(id);
        animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_MS, easing: ENTER_CURVE });
        continue;
      }
      if (shown === final) continue;

      const at = pathTween(shown, final);
      if (at === null) {
        tweens.current.delete(id);
        displayed.current.delete(id);
        animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: MOVE_MS, easing: MOVE_CURVE });
        continue;
      }
      element.setAttribute('d', shown);
      displayed.current.set(id, shown);
      tweens.current.set(id, { element, at, final, start: now });
    }

    const ghostEdges = refs.ghostEdges.current;
    for (const [id, element] of oldPaths) {
      if (paths.has(id) || element.isConnected || !ghostEdges) continue;
      const shown = displayed.current.get(id) ?? before.paths.get(id);
      tweens.current.delete(id);
      displayed.current.delete(id);
      if (shown !== undefined) element.setAttribute('d', shown);
      element.removeAttribute('data-path');
      ghostEdges.appendChild(element);
      const fade = animate(element, [{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_MS,
        easing: EXIT_CURVE,
        fill: 'forwards',
      });
      fade.onfinish = () => element.remove();
      fade.oncancel = () => element.remove();
    }

    for (const id of tweens.current.keys()) {
      if (!paths.has(id)) tweens.current.delete(id);
    }

    cancelAnimationFrame(frame.current);
    const step = (time: number): void => {
      for (const [id, tween] of tweens.current) {
        const t = Math.min(1, (time - tween.start) / MOVE_MS);
        if (t >= 1) {
          tween.element.setAttribute('d', tween.final);
          tweens.current.delete(id);
          displayed.current.delete(id);
          continue;
        }
        const value = tween.at(moveEase(Math.max(0, t)));
        tween.element.setAttribute('d', value);
        displayed.current.set(id, value);
      }
      if (tweens.current.size > 0) frame.current = requestAnimationFrame(step);
    };
    if (tweens.current.size > 0) frame.current = requestAnimationFrame(step);
  }, [layout, refs, suspended]);

  useLayoutEffect(() => () => cancelAnimationFrame(frame.current), []);
}
