import { describe, expect, it } from 'vitest';
import { createDefaultDocument, type StructureDocument } from '../src/domain/document';
import { addLink, addTerminal } from '../src/domain/operations';
import { layoutDocument, type Layout } from '../src/layout';
import { estimateTextWidth } from '../src/layout/measure';
import { CARD, TREE } from '../src/layout/metrics';
import { byName, doc, ids, named, node } from './helpers';

const options = { measure: estimateTextWidth };

function layoutOf(document: StructureDocument): Layout {
  return layoutDocument(document, options);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('layoutDocument', () => {
  it('is deterministic', () => {
    const document = createDefaultDocument();
    expect(layoutOf(document)).toEqual(layoutOf(document));
  });

  it('places every node exactly once and connects each to its parent', () => {
    const document = doc(node('company', node('pos', node('store'), node('store')), node('ecom')));
    const layout = layoutOf(document);

    expect(layout.nodes).toHaveLength(5);
    expect(new Set(layout.nodes.map((item) => item.id)).size).toBe(5);
    expect(layout.edges).toHaveLength(4);
    expect(layout.byId.size).toBe(5);
    for (const item of layout.nodes) {
      expect(layout.byId.get(item.id)).toBe(item);
    }
  });

  it('never overlaps two cards', () => {
    const document = doc(
      node(
        'company',
        node('pos', node('store'), node('store'), node('store')),
        node('bp', node('liableAccHolder', node('legalEntity', node('businessLine')), node('balanceAcc', node('payInstCard')))),
        node('ecom'),
      ),
    );
    const layout = layoutOf(document);

    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        if (!a || !b) continue;
        expect(overlaps(a, b), `${a.node.name} overlaps ${b.node.name}`).toBe(false);
      }
    }
  });

  it('puts children below their parent and keeps siblings in document order', () => {
    const document = doc(node('company', named('pos', 'A'), named('pos', 'B'), named('pos', 'C')));
    const layout = layoutOf(document);
    const root = layout.byId.get(document.root.id);
    const [a, b, c] = ['A', 'B', 'C'].map((name) => layout.byId.get(byName(document, name).id));

    if (!root || !a || !b || !c) throw new Error('expected every node in the layout');

    expect(a.y).toBeGreaterThan(root.y + root.height);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(a?.depth).toBe(1);
  });

  it('centres a parent over its children', () => {
    const document = doc(node('company', node('pos'), node('pos'), node('pos')));
    const layout = layoutOf(document);
    const root = layout.byId.get(document.root.id);
    const children = layout.nodes.filter((item) => item.parentId === document.root.id);
    const first = children[0];
    const last = children[children.length - 1];
    if (!root || !first || !last) throw new Error('missing layout');

    const rootCentre = root.x + root.width / 2;
    const spanCentre = (first.x + (last.x + last.width)) / 2;
    expect(Math.abs(rootCentre - spanCentre)).toBeLessThan(1);
  });

  it('grows a card when terminals are added', () => {
    let document = doc(node('company', node('pos', node('store'))));
    const storeId = ids(document)[2] as string;
    const before = layoutOf(document).byId.get(storeId)?.height ?? 0;

    document = addTerminal(document, storeId, 'counter');
    const after = layoutOf(document).byId.get(storeId)?.height ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('clamps a very long name and marks it as truncated', () => {
    const document = doc(node('company', named('pos', 'A very long merchant account name that will not fit on one card at all')));
    const layout = layoutOf(document);
    const item = layout.nodes.find((candidate) => candidate.parentId === document.root.id);

    expect(item?.width).toBeLessThanOrEqual(CARD.maxWidth);
    expect(item?.nameLines.length).toBeLessThanOrEqual(CARD.nameMaxLines);
    expect(item?.nameLines.at(-1)).toMatch(/…$/);
  });

  it('reports content bounds that contain every card, plus the export margin', () => {
    const document = doc(node('company', node('pos', node('store')), node('ecom')));
    const layout = layoutOf(document);

    for (const item of layout.nodes) {
      expect(item.x).toBeGreaterThanOrEqual(layout.content.x);
      expect(item.y).toBeGreaterThanOrEqual(layout.content.y);
      expect(item.x + item.width).toBeLessThanOrEqual(layout.content.x + layout.content.width);
      expect(item.y + item.height).toBeLessThanOrEqual(layout.content.y + layout.content.height);
    }

    expect(layout.bounds.x).toBe(layout.content.x - TREE.margin);
    expect(layout.bounds.width).toBe(layout.content.width + TREE.margin * 2);
  });

  it('routes a cross-link between siblings and reports both handles', () => {
    let document = doc(node('company', named('pos', 'A'), named('pos', 'B')));
    const a = byName(document, 'A');
    const b = byName(document, 'B');
    document = addLink(document, a.id, b.id);

    const layout = layoutOf(document);
    expect(layout.links).toHaveLength(1);
    const link = layout.links[0];
    expect(link?.path.startsWith('M')).toBe(true);
    expect(link?.handles).toHaveLength(2);
    expect(new Set(link?.handles.map((handle) => handle.nodeId))).toEqual(new Set([a.id, b.id]));
    expect(['lateral', 'channel']).toContain(link?.routing);
  });

  it('marks the nodes that sit inside a balance platform', () => {
    const document = doc(node('company', node('bp', node('accHolder', node('legalEntity'))), node('pos')));
    const layout = layoutOf(document);
    const holder = layout.byId.get(byName(document, 'Account Holder').id);
    const merchant = layout.byId.get(byName(document, 'POS').id);

    expect(holder?.insidePlatform).toBe(true);
    expect(merchant?.insidePlatform).toBe(false);
  });

  it('captions a balance account by the liability of its holder', () => {
    const document = doc(
      node('company', node('bp', node('liableAccHolder', node('balanceAcc')), node('accHolder', node('balanceAcc')))),
    );
    const layout = layoutOf(document);
    const captions = layout.nodes.filter((item) => item.kind === 'balanceAcc').map((item) => item.caption);

    expect(captions).toContain('Liable balance account');
    expect(captions).toContain('Balance account');
  });
});
