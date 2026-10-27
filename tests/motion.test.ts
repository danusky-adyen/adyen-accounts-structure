import { describe, expect, it } from 'vitest';
import { createDefaultDocument } from '../src/domain/document';
import { INTRO, planIntro } from '../src/design/intro';
import { cubicBezier, moveEase, pathTween } from '../src/design/motion';
import type { StructureDocument } from '../src/domain/document';
import { layoutDocument } from '../src/layout';
import { estimateTextWidth } from '../src/layout/measure';
import { importFromText } from '../src/share/import';

const computeLayout = (document: StructureDocument) => layoutDocument(document, { measure: estimateTextWidth });

describe('easing', () => {
  it('matches the CSS curve at its ends and stays monotonic', () => {
    const ease = cubicBezier(0.25, 0.8, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let last = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const value = ease(t);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(moveEase(0.5)).toBeCloseTo(ease(0.5), 6);
  });

  it('solves linear as linear', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe('connector tweens', () => {
  it('blends two paths drawn with the same commands', () => {
    const at = pathTween('M 0 0 L 10 20', 'M 10 10 L 30 40');
    expect(at).not.toBeNull();
    expect(at?.(0)).toBe('M 0 0 L 10 20');
    expect(at?.(0.5)).toBe('M 5 5 L 20 30');
    expect(at?.(1)).toBe('M 10 10 L 30 40');
  });

  it('refuses paths with different shapes, so they fade instead', () => {
    expect(pathTween('M 0 0 L 10 20', 'M 0 0 Q 5 5 10 20')).toBeNull();
    expect(pathTween('M 0 0 L 10 20', 'M 0 0 L 10 20 L 30 30')).toBeNull();
  });
});

describe('the intro', () => {
  const sample = importFromText(
    JSON.stringify({
      root: {
        kind: 'company',
        name: 'Acme',
        children: [
          { kind: 'ecom', name: 'Web', links: ['bp'] },
          { kind: 'pos', name: 'Stores', children: [{ kind: 'store', name: 'Berlin' }] },
          { id: 'bp', kind: 'bp', name: 'Platform', children: [{ kind: 'accHolder', name: 'Sellers' }] },
        ],
      },
    }),
  );
  if ('error' in sample) throw new Error(sample.error);
  const layout = computeLayout(sample.doc);
  const plan = planIntro(layout);

  it('has one dot per card, each ending on its card', () => {
    expect(plan.cards).toHaveLength(layout.nodes.length);
    for (const card of plan.cards) {
      const item = layout.byId.get(card.id);
      expect(card.rect).toMatchObject({ x: item?.x, y: item?.y, width: item?.width, height: item?.height });
    }
  });

  it('sends parents out before their children', () => {
    const byId = new Map(plan.cards.map((card) => [card.id, card]));
    for (const item of layout.nodes) {
      if (item.parentId === null) continue;
      expect(byId.get(item.id)?.flyAt).toBeGreaterThan(byId.get(item.parentId)?.flyAt ?? Infinity);
    }
  });

  it('reveals the real cards only once every shape has settled, and stays short', () => {
    for (const card of plan.cards) expect(plan.revealAt).toBeGreaterThanOrEqual(card.settledAt);
    expect(plan.doneAt).toBe(plan.revealAt + INTRO.revealMs);
    expect(plan.doneAt).toBeLessThan(2000);
  });

  it('keeps a big diagram inside the same time budget', () => {
    const big = computeLayout(createDefaultDocument());
    expect(planIntro(big).doneAt).toBeLessThan(2000);
  });
});
