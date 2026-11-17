/**
 * The card a change happens under must not move: a + or × button that slides
 * away after every click has to be found again before the next one.
 */

import { describe, expect, it } from 'vitest';
import type { NodeId, StructureDocument } from '../src/domain/document';
import { addChild, addLink, removeNode, renameNode } from '../src/domain/operations';
import { layoutDocument, type Layout } from '../src/layout';
import { chooseAnchors, type LaidOut } from '../src/layout/anchor';
import { estimateTextWidth } from '../src/layout/measure';
import { byName, doc, named, node } from './helpers';

const NONE: ReadonlySet<NodeId> = new Set();

/** What `useLayout` does: lay out the next state pinned to the previous one. */
function next(previous: LaidOut, document: StructureDocument, expandedGroups = previous.expandedGroups): LaidOut {
  const layout = layoutDocument(document, {
    measure: estimateTextWidth,
    expandedGroups,
    anchors: chooseAnchors(previous, document, expandedGroups),
  });
  return { doc: document, expandedGroups, layout };
}

function first(document: StructureDocument): LaidOut {
  return { doc: document, expandedGroups: NONE, layout: layoutDocument(document, { measure: estimateTextWidth }) };
}

function at(layout: Layout, id: NodeId): { x: number; y: number } {
  const item = layout.byId.get(id);
  if (!item) throw new Error(`${id} is not laid out`);
  return { x: item.x, y: item.y };
}

function sample(): StructureDocument {
  return doc(
    node(
      'company',
      named('pos', 'Retail', named('store', 'Store 1')),
      named('ecom', 'Webshop'),
      named('pos', 'Outlets', named('store', 'Outlet 1')),
    ),
  );
}

describe('a pinned layout', () => {
  it('keeps the merchant account still while stores are added under it, past the point they group', () => {
    let state = first(sample());
    const retail = byName(state.doc, 'Retail').id;
    const start = at(state.layout, retail);

    for (let count = 0; count < 12; count += 1) {
      const { doc: added, createdId } = addChild(state.doc, retail, 'store');
      expect(createdId).not.toBeNull();
      state = next(state, added);
      expect(at(state.layout, retail)).toEqual(start);
    }
    expect(state.layout.groups.some((group) => group.parentId === retail)).toBe(true);
  });

  it('keeps it still while stores are removed again, back out of the group', () => {
    let state = first(sample());
    const retail = byName(state.doc, 'Retail').id;
    for (let count = 0; count < 8; count += 1) state = next(state, addChild(state.doc, retail, 'store').doc);
    const start = at(state.layout, retail);

    for (let count = 0; count < 8; count += 1) {
      const store = state.doc.root.children[0]?.children.at(-1);
      if (!store) throw new Error('no store left');
      state = next(state, removeNode(state.doc, store.id));
      expect(at(state.layout, retail)).toEqual(start);
    }
    expect(state.layout.groups).toHaveLength(0);
  });

  it('keeps a group owner still while the group opens and folds', () => {
    let state = first(sample());
    const retail = byName(state.doc, 'Retail').id;
    for (let count = 0; count < 30; count += 1) state = next(state, addChild(state.doc, retail, 'store').doc);
    const start = at(state.layout, retail);
    expect(state.layout.groups.find((group) => group.parentId === retail)?.hidden).toBeGreaterThan(0);

    state = next(state, state.doc, new Set([retail]));
    expect(at(state.layout, retail)).toEqual(start);
    state = next(state, state.doc, NONE);
    expect(at(state.layout, retail)).toEqual(start);
  });

  it('pins the root for every other edit, so the diagram never drifts', () => {
    let state = first(sample());
    const root = state.doc.root.id;
    const start = at(state.layout, root);

    const webshop = byName(state.doc, 'Webshop').id;
    state = next(state, renameNode(state.doc, webshop, 'A much longer webshop name'));
    expect(at(state.layout, root)).toEqual(start);
    state = next(state, addLink(state.doc, byName(state.doc, 'Retail').id, webshop));
    expect(at(state.layout, root)).toEqual(start);
  });

  it('draws connectors from where the shifted cards are', () => {
    let state = first(sample());
    const retail = byName(state.doc, 'Retail').id;
    for (let count = 0; count < 3; count += 1) state = next(state, addChild(state.doc, retail, 'store').doc);

    const parent = state.layout.byId.get(retail);
    const edge = state.layout.edges.find((item) => item.parentId === retail);
    if (!parent || !edge) throw new Error('missing parent or edge');
    expect(edge.path.startsWith(`M ${parent.x + parent.width / 2} ${parent.y + parent.height}`)).toBe(true);
    for (const item of state.layout.nodes) {
      expect(item.x).toBeGreaterThanOrEqual(state.layout.content.x);
      expect(item.y).toBeGreaterThanOrEqual(state.layout.content.y);
    }
  });

  it('starts a different diagram at the origin, as a fresh layout would', () => {
    let state = first(sample());
    const retail = byName(state.doc, 'Retail').id;
    for (let count = 0; count < 3; count += 1) state = next(state, addChild(state.doc, retail, 'store').doc);

    const other = doc(node('company', named('pos', 'Elsewhere')));
    const replaced = next(state, other);
    expect(replaced.layout.nodes).toEqual(first(other).layout.nodes);
  });
});
