import { describe, expect, it } from 'vitest';
import { EXPLANATIONS, explanationFor } from '../src/domain/explanations';
import { NODE_KINDS } from '../src/domain/kinds';

describe('Explain mode text', () => {
  it.each(NODE_KINDS)('explains a %s card in a summary and a few points', (kind) => {
    const explanation = EXPLANATIONS[kind];
    expect(explanation.summary.length).toBeGreaterThan(20);
    expect(explanation.points.length).toBeGreaterThanOrEqual(2);
    expect(explanation.points.length).toBeLessThanOrEqual(6);
    for (const point of explanation.points) {
      expect(point.title.trim()).not.toBe('');
      expect(point.text).toMatch(/\.$/);
    }
    expect(new Set(explanation.points.map((point) => point.title)).size).toBe(explanation.points.length);
  });

  it('says where payouts and reports live on a merchant account', () => {
    const titles = explanationFor('ecom', 'company').points.map((point) => point.title);
    expect(titles).toEqual(expect.arrayContaining(['Payouts', 'Reconciliation reports', 'Payment methods']));
  });

  it('calls out the liable balance account under the liable account holder', () => {
    expect(explanationFor('balanceAcc', 'liableAccHolder').points[0]?.title).toBe('Liable balance account');
    expect(explanationFor('balanceAcc', 'accHolder')).toBe(EXPLANATIONS.balanceAcc);
  });
});
