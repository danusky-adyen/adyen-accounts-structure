/**
 * Which card holds still when the diagram changes.
 *
 * The tree is laid out from scratch on every edit, and a parent is centred over
 * its children, so adding a store under a merchant account moves the merchant
 * account, and everything beside it, by half a card. On screen that reads as
 * the card running away from the pointer, and the next click on its + button
 * misses. Pinning one card to the canvas point it had keeps it, and its
 * buttons, exactly where they were; everything else grows around it.
 *
 * The card that holds still is the one the change happened under: the parent
 * of an added or removed card, the owner of a group that opened or folded.
 * Anything else (a rename, a move, a setting) pins the root, so the diagram
 * never drifts on its own.
 */

import { forEachNode, type NodeId, type StructureDocument } from '../domain/document';
import type { Layout, LayoutAnchor } from './index';

export interface LaidOut {
  readonly doc: StructureDocument;
  readonly expandedGroups: ReadonlySet<NodeId>;
  readonly layout: Layout;
}

function parents(doc: StructureDocument): Map<NodeId, NodeId | null> {
  const result = new Map<NodeId, NodeId | null>([[doc.root.id, null]]);
  forEachNode(doc, (node) => {
    for (const child of node.children) result.set(child.id, node.id);
  });
  return result;
}

/** Candidates in order of preference; the layout uses the first it can place. */
export function chooseAnchors(
  previous: LaidOut,
  doc: StructureDocument,
  expandedGroups: ReadonlySet<NodeId>,
): LayoutAnchor[] {
  const ids: NodeId[] = [];

  if (previous.doc !== doc) {
    const before = parents(previous.doc);
    const after = parents(doc);
    for (const [id, parent] of after) {
      if (!before.has(id) && parent !== null) {
        ids.push(parent);
        break;
      }
    }
    for (const [id, parent] of before) {
      if (!after.has(id) && parent !== null) {
        ids.push(parent);
        break;
      }
    }
  }

  if (previous.expandedGroups !== expandedGroups) {
    for (const id of expandedGroups) if (!previous.expandedGroups.has(id)) ids.push(id);
    for (const id of previous.expandedGroups) if (!expandedGroups.has(id)) ids.push(id);
  }

  ids.push(doc.root.id);

  const anchors: LayoutAnchor[] = [];
  for (const id of ids) {
    const item = previous.layout.byId.get(id);
    if (item) anchors.push({ id, x: item.x, y: item.y });
  }
  return anchors;
}
