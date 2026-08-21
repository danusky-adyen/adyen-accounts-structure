/**
 * Turns a pointer position into a concrete drop action.
 *
 * The previous version overloaded a single drop: a card dropped on another card
 * became either a reorder or a cross-link depending on which branch of a long
 * if-chain matched first, which made reordering linkable siblings impossible.
 * The card is now divided into zones: the edges reorder, the middle links or
 * reparents.
 */

import type { NodeId, StructureDocument } from '../domain/document';
import { canCreateLink, canMoveNode } from '../domain/operations';
import type { Layout, LayoutNode } from '../layout';
import type { Point } from '../layout/geometry';
import type { DropAction, DropTarget } from '../state/store';

const HIT_PADDING = 8;
const MAX_EDGE_ZONE = 44;
const EDGE_ZONE_RATIO = 0.26;

export function hitTestNode(layout: Layout, point: Point, exclude: NodeId | null): LayoutNode | null {
  // Later nodes are deeper in the tree and drawn on top, so scan backwards.
  for (let index = layout.nodes.length - 1; index >= 0; index -= 1) {
    const node = layout.nodes[index];
    if (!node || node.id === exclude) continue;
    if (
      point.x >= node.x - HIT_PADDING &&
      point.x <= node.x + node.width + HIT_PADDING &&
      point.y >= node.y - HIT_PADDING &&
      point.y <= node.y + node.height + HIT_PADDING
    ) {
      return node;
    }
  }
  return null;
}

function zoneOf(node: LayoutNode, point: Point): 'before' | 'after' | 'center' {
  const edge = Math.min(MAX_EDGE_ZONE, node.width * EDGE_ZONE_RATIO);
  if (point.x < node.x + edge) return 'before';
  if (point.x > node.x + node.width - edge) return 'after';
  return 'center';
}

function isAllowed(doc: StructureDocument, draggedId: NodeId, targetId: NodeId, action: DropAction): boolean {
  if (action === 'link') return canCreateLink(doc, draggedId, targetId);
  return canMoveNode(doc, draggedId, targetId, action);
}

export function resolveDropTarget(
  doc: StructureDocument,
  layout: Layout,
  draggedId: NodeId,
  point: Point,
): DropTarget | null {
  const target = hitTestNode(layout, point, draggedId);
  if (!target) return null;

  const zone = zoneOf(target, point);
  const preference: DropAction[] =
    zone === 'center' ? ['link', 'inside', 'after'] : zone === 'before' ? ['before', 'link', 'inside'] : ['after', 'link', 'inside'];

  for (const action of preference) {
    if (isAllowed(doc, draggedId, target.id, action)) return { nodeId: target.id, action };
  }
  return null;
}

export interface DropCandidates {
  readonly all: ReadonlySet<NodeId>;
  readonly linkable: ReadonlySet<NodeId>;
}

/** Everything the dragged node could be dropped on, used to dim the rest. */
export function dropCandidates(doc: StructureDocument, layout: Layout, draggedId: NodeId): DropCandidates {
  const all = new Set<NodeId>();
  const linkable = new Set<NodeId>();

  for (const node of layout.nodes) {
    if (node.id === draggedId) continue;
    if (canCreateLink(doc, draggedId, node.id)) {
      linkable.add(node.id);
      all.add(node.id);
      continue;
    }
    if (
      canMoveNode(doc, draggedId, node.id, 'inside') ||
      canMoveNode(doc, draggedId, node.id, 'before') ||
      canMoveNode(doc, draggedId, node.id, 'after')
    ) {
      all.add(node.id);
    }
  }

  return { all, linkable };
}
