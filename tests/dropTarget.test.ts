import { describe, expect, it } from 'vitest';
import { resolveDropTarget } from '../src/interaction/dropTarget';
import { layoutDocument } from '../src/layout';
import { estimateTextWidth } from '../src/layout/measure';
import { TREE } from '../src/layout/metrics';
import { byName, doc, named } from './helpers';

const sample = doc(
  named(
    'company',
    'Acme',
    named('pos', 'Empty stores'),
    named('pos', 'Stores', named('store', 'Berlin'), named('store', 'Paris')),
    named('ecom', 'Web'),
  ),
);
const layout = layoutDocument(sample, { measure: estimateTextWidth });
const card = (name: string) => {
  const found = layout.byId.get(byName(sample, name).id);
  if (!found) throw new Error(`No card for ${name}`);
  return found;
};
const id = (name: string) => byName(sample, name).id;

describe('resolveDropTarget', () => {
  it('still reorders when dropped on a card edge', () => {
    const paris = card('Paris');
    const target = resolveDropTarget(sample, layout, id('Berlin'), { x: paris.x + paris.width - 4, y: paris.y + 10 });
    expect(target).toEqual({ nodeId: id('Paris'), action: 'after' });
  });

  it('places a card at the end of a row when dropped in the open space past it', () => {
    const paris = card('Paris');
    const target = resolveDropTarget(sample, layout, id('Berlin'), {
      x: paris.x + paris.width + 60,
      y: paris.y + paris.height / 2,
    });
    expect(target).toEqual({ nodeId: id('Paris'), action: 'after' });
  });

  it('places a card at the start of a row when dropped in the open space before it', () => {
    const berlin = card('Berlin');
    const target = resolveDropTarget(sample, layout, id('Paris'), {
      x: berlin.x - TREE.siblingGap / 2,
      y: berlin.y + berlin.height + TREE.rowGap / 4,
    });
    expect(target).toEqual({ nodeId: id('Berlin'), action: 'before' });
  });

  it('moves a card into a parent with no children when dropped in the space under it', () => {
    const empty = card('Empty stores');
    const target = resolveDropTarget(sample, layout, id('Paris'), {
      x: empty.x + empty.width / 2,
      y: empty.y + empty.height + TREE.rowGap + 20,
    });
    expect(target).toEqual({ nodeId: id('Empty stores'), action: 'inside' });
  });

  it('ignores open space far from any card', () => {
    const paris = card('Paris');
    expect(resolveDropTarget(sample, layout, id('Berlin'), { x: paris.x, y: paris.y + paris.height + 400 })).toBeNull();
  });
});
