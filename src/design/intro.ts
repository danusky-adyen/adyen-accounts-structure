/**
 * The choreography of the intro, worked out once from the layout: a cluster of
 * dots, one per card, that pops up in the middle, flies out to where each card
 * goes, and opens into the card's icon tile while the card grows around it.
 * Kept free of the DOM so the timing can be tested.
 */

import type { NodeId } from '../domain/document';
import { specOf } from '../domain/kinds';
import type { TintName } from './palette';
import type { Layout } from '../layout';
import type { Point, Rect } from '../layout/geometry';

export const INTRO = {
  /** Dot radius in screen pixels, whatever the zoom. */
  dotRadius: 6,
  /** Spacing of the sunflower cluster the dots start in, in screen pixels. */
  clusterSpacing: 13,
  popMs: 260,
  popStaggerMs: 30,
  popStaggerTotalMs: 260,
  flyStartMs: 340,
  flyMs: 460,
  depthStaggerMs: 70,
  depthStaggerTotalMs: 320,
  /** The tile starts opening just before the dot lands, so it never stops dead. */
  morphOverlapMs: 90,
  morphMs: 300,
  edgeMs: 280,
  linksMs: 240,
  revealMs: 320,
} as const;

export interface IntroCard {
  readonly id: NodeId;
  readonly rect: Rect;
  /** The icon tile, in world coordinates. */
  readonly tile: Rect;
  readonly tint: TintName;
  /** The card's own background and border, as the canvas draws them. */
  readonly surface: 'surface' | 'platform' | 'sunken';
  readonly strongBorder: boolean;
  /** Where the dot sits in the cluster, in screen pixels from its centre. */
  readonly cluster: Point;
  /** Which way, and how far, the flight curves: a share of its length. */
  readonly bend: number;
  readonly popAt: number;
  readonly flyAt: number;
  readonly morphAt: number;
  readonly settledAt: number;
}

export interface IntroEdge {
  readonly id: string;
  readonly path: string;
  readonly drawAt: number;
}

export interface IntroPlan {
  /** The middle of the diagram: where the cluster gathers. */
  readonly centre: Point;
  readonly cards: readonly IntroCard[];
  readonly edges: readonly IntroEdge[];
  readonly links: readonly { readonly id: string; readonly path: string }[];
  readonly linksAt: number;
  /** When the real cards start fading in over the shapes. */
  readonly revealAt: number;
  readonly doneAt: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function planIntro(layout: Layout): IntroPlan {
  const { content } = layout;
  const centre = { x: content.x + content.width / 2, y: content.y + content.height / 2 };
  const count = layout.nodes.length;
  const maxDepth = layout.nodes.reduce((deepest, item) => Math.max(deepest, item.depth), 0);
  const popStagger = Math.min(INTRO.popStaggerMs, INTRO.popStaggerTotalMs / Math.max(1, count));
  const depthStagger = Math.min(INTRO.depthStaggerMs, INTRO.depthStaggerTotalMs / Math.max(1, maxDepth));

  const cards = layout.nodes.map((item, index): IntroCard => {
    const angle = index * GOLDEN_ANGLE;
    const radius = INTRO.clusterSpacing * Math.sqrt(index + 0.5);
    const popAt = index * popStagger;
    // Parents leave first, so the structure unfolds from the top down.
    const flyAt = INTRO.flyStartMs + item.depth * depthStagger + (index % 4) * 14;
    const morphAt = flyAt + INTRO.flyMs - INTRO.morphOverlapMs;
    const spec = specOf(item.kind);
    return {
      id: item.id,
      rect: { x: item.x, y: item.y, width: item.width, height: item.height },
      tile: {
        x: item.x + item.slots.icon.x,
        y: item.y + item.slots.icon.y,
        width: item.slots.icon.width,
        height: item.slots.icon.height,
      },
      tint: spec.tint,
      surface: spec.tone === 'management' ? 'sunken' : item.insidePlatform ? 'platform' : 'surface',
      strongBorder: spec.tone === 'root',
      cluster: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
      bend: (index % 2 === 0 ? 1 : -1) * (0.14 + (index % 3) * 0.05),
      popAt,
      flyAt,
      morphAt,
      settledAt: morphAt + INTRO.morphMs,
    };
  });

  const settledAt = new Map(cards.map((card) => [card.id, card.morphAt]));
  const edges = layout.edges.map((edge) => ({
    id: edge.id,
    path: edge.path,
    drawAt: settledAt.get(edge.childId) ?? 0,
  }));

  const lastSettled = cards.reduce((latest, card) => Math.max(latest, card.settledAt), 0);
  const lastEdge = edges.reduce((latest, edge) => Math.max(latest, edge.drawAt + INTRO.edgeMs), 0);
  const linksAt = lastSettled - INTRO.linksMs;
  const revealAt = Math.max(lastSettled, lastEdge) + 20;

  return {
    centre,
    cards,
    edges,
    links: layout.links.map((link) => ({ id: link.id, path: link.path })),
    linksAt,
    revealAt,
    doneAt: revealAt + INTRO.revealMs,
  };
}
