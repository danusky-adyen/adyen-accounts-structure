import { useEffect, useRef, useState } from 'react';
import { INTRO, planIntro, type IntroPlan } from '../design/intro';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, progress } from '../design/motion';
import type { Layout } from '../layout';
import { CARD } from '../layout/metrics';
import { RADIUS } from '../design/tokens';
import { getViewport } from '../state/viewport';
import styles from './Intro.module.css';

export interface IntroProps {
  readonly layout: Layout;
  /** The shapes are in place: the real cards can fade in over them. */
  readonly onReveal: () => void;
  readonly onDone: () => void;
}

interface CardParts {
  readonly card: SVGRectElement;
  readonly tile: SVGRectElement;
  readonly dot: SVGRectElement;
}

function setRect(element: SVGRectElement, x: number, y: number, width: number, height: number, radius: number): void {
  element.setAttribute('x', String(x));
  element.setAttribute('y', String(y));
  element.setAttribute('width', String(Math.max(0, width)));
  element.setAttribute('height', String(Math.max(0, height)));
  element.setAttribute('rx', String(Math.max(0, radius)));
}

/** One frame of the intro, written straight onto the SVG. */
function paint(plan: IntroPlan, elapsed: number, world: SVGGElement, parts: readonly CardParts[], edges: readonly SVGPathElement[], links: SVGGElement): void {
  const viewport = getViewport();
  const scale = viewport.scale;
  world.setAttribute('transform', `translate(${viewport.x} ${viewport.y}) scale(${scale})`);

  // The cluster turns slowly and breathes while it waits, so it feels alive.
  const turn = elapsed * 0.0011;
  const breath = 1 + 0.06 * Math.sin(elapsed / 170);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const dotRadius = INTRO.dotRadius / scale;

  plan.cards.forEach((card, index) => {
    const part = parts[index];
    if (!part) return;

    const startX = plan.centre.x + ((card.cluster.x * cos - card.cluster.y * sin) * breath) / scale;
    const startY = plan.centre.y + ((card.cluster.x * sin + card.cluster.y * cos) * breath) / scale;
    const endX = card.tile.x + card.tile.width / 2;
    const endY = card.tile.y + card.tile.height / 2;

    // A quadratic curve, bent sideways, so the dots fan out rather than shoot.
    const fly = easeInOutCubic(progress(elapsed, card.flyAt, INTRO.flyMs));
    const distance = Math.hypot(endX - startX, endY - startY);
    const controlX = (startX + endX) / 2 - ((endY - startY) / (distance || 1)) * card.bend * distance;
    const controlY = (startY + endY) / 2 + ((endX - startX) / (distance || 1)) * card.bend * distance;
    const inverse = 1 - fly;
    const x = inverse * inverse * startX + 2 * inverse * fly * controlX + fly * fly * endX;
    const y = inverse * inverse * startY + 2 * inverse * fly * controlY + fly * fly * endY;

    const pop = easeOutBack(progress(elapsed, card.popAt, INTRO.popMs));
    const rawMorph = progress(elapsed, card.morphAt, INTRO.morphMs);
    const morph = easeOutCubic(rawMorph);

    const size = lerp(2 * dotRadius * pop, card.tile.width, morph);
    const centreX = lerp(x, endX, morph);
    const centreY = lerp(y, endY, morph);
    const tileRadius = lerp(size / 2, RADIUS.m, morph);
    setRect(part.dot, centreX - size / 2, centreY - size / 2, size, size, tileRadius);
    setRect(part.tile, centreX - size / 2, centreY - size / 2, size, size, tileRadius);
    part.dot.style.opacity = String(pop <= 0 ? 0 : 1 - clamp01((rawMorph - 0.3) / 0.6));
    part.tile.style.opacity = String(clamp01(rawMorph * 1.8));

    const grow = easeOutCubic(progress(elapsed, card.morphAt + 40, INTRO.morphMs));
    const tile = card.tile;
    // Inset by half the stroke: a CSS border sits inside the box, an SVG stroke straddles it.
    setRect(
      part.card,
      lerp(tile.x, card.rect.x, grow) + 0.5,
      lerp(tile.y, card.rect.y, grow) + 0.5,
      lerp(tile.width, card.rect.width, grow) - 1,
      lerp(tile.height, card.rect.height, grow) - 1,
      lerp(RADIUS.m, CARD.radius, grow) - 0.5,
    );
    part.card.style.opacity = String(clamp01(grow * 2.5));
  });

  plan.edges.forEach((edge, index) => {
    const path = edges[index];
    if (!path) return;
    path.style.strokeDashoffset = String(1 - easeOutCubic(progress(elapsed, edge.drawAt, INTRO.edgeMs)));
  });

  links.style.opacity = String(progress(elapsed, plan.linksAt, INTRO.linksMs));
}

/**
 * The intro: dots gather, fly out and open into the cards. It draws under the
 * real diagram, which stays hidden until the shapes match it and then fades in
 * on top, so the hand-over cannot be seen. Any key, click or scroll skips ahead.
 */
export function Intro({ layout, onReveal, onDone }: IntroProps) {
  const [plan] = useState(() => planIntro(layout));
  const worldRef = useRef<SVGGElement>(null);
  const linksRef = useRef<SVGGElement>(null);
  const cardRefs = useRef<(CardParts | null)[]>([]);
  const edgeRefs = useRef<(SVGPathElement | null)[]>([]);
  const callbacks = useRef({ onReveal, onDone });

  useEffect(() => {
    callbacks.current = { onReveal, onDone };
  }, [onReveal, onDone]);

  useEffect(() => {
    const world = worldRef.current;
    const links = linksRef.current;
    if (!world || !links) return;
    const parts = cardRefs.current.filter((part): part is CardParts => part !== null);
    const edges = edgeRefs.current.filter((path): path is SVGPathElement => path !== null);

    let start: number | null = null;
    let revealed = false;
    let frame = 0;

    const tick = (now: number): void => {
      start ??= now;
      const elapsed = now - start;
      paint(plan, elapsed, world, parts, edges, links);
      if (!revealed && elapsed >= plan.revealAt) {
        revealed = true;
        callbacks.current.onReveal();
      }
      if (elapsed >= plan.doneAt) {
        callbacks.current.onDone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const skip = (): void => {
      if (start === null || revealed) return;
      start = performance.now() - plan.revealAt;
    };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    window.addEventListener('wheel', skip, { capture: true, passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('wheel', skip, true);
    };
  }, [plan]);

  return (
    <svg className={styles.layer} aria-hidden>
      <g ref={worldRef}>
        <g>
          {plan.edges.map((edge, index) => (
            <path
              key={edge.id}
              ref={(element) => {
                edgeRefs.current[index] = element;
              }}
              className={styles.edge}
              d={edge.path}
              pathLength={1}
            />
          ))}
        </g>
        <g ref={linksRef} style={{ opacity: 0 }}>
          {plan.links.map((link) => (
            <path key={link.id} className={styles.link} d={link.path} />
          ))}
        </g>
        {plan.cards.map((card, index) => (
          <g
            key={card.id}
            ref={(group) => {
              const rects = group?.querySelectorAll('rect');
              const [cardRect, tile, dot] = rects ? [...rects] : [];
              cardRefs.current[index] = cardRect && tile && dot ? { card: cardRect, tile, dot } : null;
            }}
          >
            <rect
              className={styles.card}
              data-surface={card.surface}
              data-strong={card.strongBorder}
              style={{ opacity: 0 }}
            />
            <rect style={{ fill: `var(--tint-${card.tint}-fill)`, opacity: 0 }} />
            <rect style={{ fill: `var(--tint-${card.tint}-line)`, opacity: 0 }} />
          </g>
        ))}
      </g>
    </svg>
  );
}
