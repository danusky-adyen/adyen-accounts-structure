import { describe, expect, it } from 'vitest';
import type { AccountNode, StructureDocument } from '../src/domain/document';
import { addLink, addTerminal } from '../src/domain/operations';
import { renderDiagramSvg } from '../src/export/svg';
import { resolveDropTarget } from '../src/interaction/dropTarget';
import { layoutDocument, type Layout, type LayoutGroup } from '../src/layout';
import { estimateTextWidth } from '../src/layout/measure';
import { COMPACT, GROUP } from '../src/layout/metrics';
import { byName, doc, named, node } from './helpers';

function layoutOf(document: StructureDocument, expandedGroups: ReadonlySet<string> = new Set()): Layout {
  return layoutDocument(document, { measure: estimateTextWidth, expandedGroups });
}

function stores(count: number): AccountNode[] {
  return Array.from({ length: count }, (_, index) => named('store', `Store ${index + 1}`));
}

function inside(inner: { x: number; y: number; width: number; height: number }, outer: LayoutGroup): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('grouped siblings', () => {
  it('leaves a short run of childless siblings as ordinary cards', () => {
    const layout = layoutOf(doc(node('company', named('pos', 'POS', ...stores(GROUP.minItems - 1)))));

    expect(layout.groups).toHaveLength(0);
    expect(layout.nodes.every((item) => !item.slots.compact && item.groupId === null)).toBe(true);
  });

  it('frames a long run in a grid of compact cards with one connector', () => {
    const document = doc(node('company', named('pos', 'POS', ...stores(6))));
    const layout = layoutOf(document);
    const pos = byName(document, 'POS');
    const [group] = layout.groups;
    if (!group) throw new Error('expected a group');

    expect(group.parentId).toBe(pos.id);
    expect(group.columns).toBe(3);
    expect(group.label).toBe('6 stores');
    // Two full rows of three fit the preview, so there is nothing to fold away.
    expect(group.collapsible).toBe(false);
    expect(group.more).toBeNull();

    const cells = layout.nodes.filter((item) => item.groupId === group.id);
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell.slots.compact).toBe(true);
      expect(cell.width).toBe(COMPACT.width);
      expect(cell.parentId).toBe(pos.id);
      expect(inside(cell, group)).toBe(true);
    }
    expect(new Set(cells.map((cell) => cell.y)).size).toBe(2);

    expect(layout.edges.filter((edge) => edge.parentId === pos.id).map((edge) => edge.childId)).toEqual([group.id]);
  });

  it('shows a preview of a very long run, with the rest counted on a +N tile', () => {
    const document = doc(node('company', named('pos', 'POS', ...stores(57))));
    const layout = layoutOf(document);
    const [group] = layout.groups;
    if (!group) throw new Error('expected a group');

    const capacity = GROUP.maxColumns * GROUP.previewRows;
    expect(group.columns).toBe(GROUP.maxColumns);
    expect(group.collapsible).toBe(true);
    expect(group.expanded).toBe(false);
    expect(group.hidden).toBe(57 - (capacity - 1));
    expect(layout.nodes.filter((item) => item.groupId === group.id)).toHaveLength(capacity - 1);
    expect(group.more).not.toBeNull();
    if (group.more) expect(inside(group.more, group)).toBe(true);

    // The whole diagram stays about as wide as one grid, not 57 cards.
    expect(layout.content.width).toBeLessThan(GROUP.maxColumns * (COMPACT.width + GROUP.gap) + 2 * GROUP.padding + 1);
  });

  it('shows every card once the group is opened, in document order', () => {
    const document = doc(node('company', named('pos', 'POS', ...stores(13))));
    const pos = byName(document, 'POS');
    const layout = layoutOf(document, new Set([pos.id]));
    const [group] = layout.groups;
    if (!group) throw new Error('expected a group');

    const cells = layout.nodes.filter((item) => item.groupId === group.id);
    expect(group.expanded).toBe(true);
    expect(group.hidden).toBe(0);
    expect(group.more).toBeNull();
    expect(cells.map((cell) => cell.node.name)).toEqual(pos.children.map((child) => child.name));
    // Row-major: the fifth card starts the second row of four.
    expect(cells[4]?.x).toBe(cells[0]?.x);
    expect(cells[4]?.y).toBeGreaterThan(cells[0]?.y ?? Infinity);
  });

  it('keeps siblings with children, and the balance platform, out of the grid', () => {
    const merchants = Array.from({ length: 6 }, (_, index) => named('ecom', `Web ${index + 1}`));
    const document = doc(node('company', ...merchants, named('pos', 'Shops', ...stores(2)), node('bp')));
    const layout = layoutOf(document);
    const [group] = layout.groups;
    if (!group) throw new Error('expected a group');

    const shops = layout.byId.get(byName(document, 'Shops').id);
    const platform = layout.nodes.find((item) => item.kind === 'bp');
    expect(shops?.groupId).toBeNull();
    expect(platform?.groupId).toBeNull();
    expect(layout.nodes.filter((item) => item.groupId === group.id)).toHaveLength(6);

    for (const item of layout.nodes) {
      if (item.groupId === null && item.depth >= group.depth) {
        expect(overlaps(item, group), `${item.node.name} overlaps the group`).toBe(false);
      }
    }
  });

  it('sums up what a compact card leaves out', () => {
    let document = doc(node('company', named('pos', 'POS', ...stores(6))));
    const first = byName(document, 'Store 1');
    document = addTerminal(document, first.id, 'counter');
    document = addTerminal(document, first.id, 'counter');
    const layout = layoutOf(document);

    expect(layout.byId.get(first.id)?.slots.meta).toBe('2 terminals');
    expect(layout.byId.get(byName(document, 'Store 2').id)?.slots.meta).toBe('Store');
  });

  it('routes links to a card in a grid below the tree', () => {
    let document = doc(
      node(
        'company',
        named('pos', 'POS', ...stores(6)),
        node('bp', node('liableAccHolder', node('legalEntity', named('businessLine', 'Line')))),
      ),
    );
    document = addLink(document, byName(document, 'Line').id, byName(document, 'Store 5').id);
    const layout = layoutOf(document);

    expect(layout.links).toHaveLength(1);
    expect(layout.links[0]?.routing).toBe('channel');
  });

  it('drops a card anywhere on a frame into the group', () => {
    const document = doc(
      node('company', named('pos', 'POS', ...stores(6)), named('pos', 'Other', named('store', 'Loose'))),
    );
    const layout = layoutOf(document);
    const [group] = layout.groups;
    if (!group) throw new Error('expected a group');

    // In the header band, clear of every card.
    const target = resolveDropTarget(document, layout, byName(document, 'Loose').id, {
      x: group.x + group.width / 2,
      y: group.y + GROUP.headerHeight / 2,
    });
    expect(target).toEqual({ nodeId: byName(document, 'POS').id, action: 'inside' });
  });

  it('exports the frame, its label and the +N tile', () => {
    const layout = layoutOf(doc(node('company', named('pos', 'POS', ...stores(20)))));
    const svg = renderDiagramSvg(layout, { theme: 'light', background: true, title: 'Stores' });

    expect(svg).toContain('20 STORES');
    expect(svg).toContain(`+${20 - (GROUP.maxColumns * GROUP.previewRows - 1)} MORE`);
    expect(svg).toContain('text-anchor="start"');
  });
});
