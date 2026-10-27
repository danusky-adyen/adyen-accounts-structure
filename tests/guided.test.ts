import { describe, expect, it } from 'vitest';
import { collectLinks, forEachNode, type AccountNode, type StructureDocument } from '../src/domain/document';
import { DEFAULT_ANSWERS, GUIDED_LIMITS, buildFromAnswers, type GuidedAnswers } from '../src/domain/guided';
import { isIntegrationId } from '../src/domain/integrations';
import type { NodeKind } from '../src/domain/kinds';
import { normalizeDocument } from '../src/domain/normalize';
import { isPaymentMethodId } from '../src/domain/paymentMethods';
import { TEMPLATES } from '../src/domain/templates';
import { byName } from './helpers';

function build(overrides: Partial<GuidedAnswers>): StructureDocument {
  return buildFromAnswers({ ...DEFAULT_ANSWERS, ...overrides });
}

function count(document: StructureDocument, kind: NodeKind): number {
  let total = 0;
  forEachNode(document, (node) => {
    if (node.kind === kind) total += 1;
  });
  return total;
}

function all(document: StructureDocument, kind: NodeKind): AccountNode[] {
  const found: AccountNode[] = [];
  forEachNode(document, (node) => {
    if (node.kind === kind) found.push(node);
  });
  return found;
}

function linked(document: StructureDocument, a: AccountNode, b: AccountNode): boolean {
  return collectLinks(document).some(
    (link) => (link.source === a.id && link.target === b.id) || (link.source === b.id && link.target === a.id),
  );
}

describe('the guided setup', () => {
  it('draws a single webshop from the defaults', () => {
    const result = build({});
    expect(result.root.name).toBe('Acme Group');
    expect(result.root.children.map((child) => child.kind)).toEqual(['ecom']);
    const shop = byName(result, 'Acme Group Online');
    expect(shop.integrations).toEqual([{ id: 'webDropin', version: '' }]);
    expect(shop.methods).toEqual(DEFAULT_ANSWERS.methods);
  });

  it('gives every store its terminals, or the merchant account when there are no stores', () => {
    const withStores = build({ online: false, inPerson: true, storesPerAccount: 3, terminal: 'mobile', terminalsPerStore: 2 });
    expect(count(withStores, 'store')).toBe(3);
    for (const store of all(withStores, 'store')) expect(store.terminals).toEqual(['mobile', 'mobile']);

    const without = build({ online: false, inPerson: true, storesPerAccount: 0, terminal: 'reader' });
    expect(count(without, 'store')).toBe(0);
    expect(all(without, 'pos')[0]?.terminals).toEqual(['reader']);
  });

  it('repeats the merchant accounts per country and links each pair', () => {
    const result = build({ split: 'country', segments: 'NL, DE; UK, NL,', inPerson: true, storesPerAccount: 1 });
    expect(count(result, 'pos')).toBe(3);
    expect(count(result, 'ecom')).toBe(3);
    const online = byName(result, 'Acme Group DE Online');
    const stores = byName(result, 'Acme Group DE Stores');
    expect(linked(result, online, stores)).toBe(true);
    expect(linked(result, online, byName(result, 'Acme Group NL Stores'))).toBe(false);
    expect(byName(result, 'DE Store 1').kind).toBe('store');
  });

  it('names brand accounts after the brand', () => {
    const result = build({ split: 'brand', segments: 'Nova, Lumen' });
    expect(result.root.children.map((child) => child.name)).toEqual(['Nova Online', 'Lumen Online']);
  });

  it('builds a platform every merchant account is funded by', () => {
    const result = build({ inPerson: true, platform: true, accountHolders: 3, cards: true, payouts: true });
    const platform = all(result, 'bp')[0] as AccountNode;
    for (const account of [...all(result, 'pos'), ...all(result, 'ecom')]) {
      expect(linked(result, account, platform)).toBe(true);
    }
    expect(count(result, 'liableAccHolder')).toBe(1);
    expect(count(result, 'accHolder')).toBe(3);
    expect(count(result, 'legalEntity')).toBe(4);
    expect(count(result, 'transferInst')).toBe(4);
    expect(count(result, 'payInstCard')).toBe(4);
    expect(all(result, 'accHolder').map((holder) => holder.name)).toEqual(['Seller 1', 'Seller 2', 'Seller 3']);
    expect(platform.integrations.map((entry) => entry.id)).toEqual(['platforms', 'issuing']);
  });

  it('links each franchisee to the store they run', () => {
    const result = build({
      online: false,
      inPerson: true,
      storesPerAccount: 2,
      platform: true,
      holderLabel: 'Franchisee',
      accountHolders: 3,
      holdersRunStores: true,
    });
    const lines = all(result, 'businessLine');
    expect(lines).toHaveLength(3);
    const stores = all(result, 'store');
    expect(linked(result, lines[0] as AccountNode, stores[0] as AccountNode)).toBe(true);
    expect(linked(result, lines[1] as AccountNode, stores[1] as AccountNode)).toBe(true);
    // More franchisees than stores: the extra one has no store to link to.
    expect(collectLinks(result).filter((link) => link.source === lines[2]?.id || link.target === lines[2]?.id)).toEqual([]);
  });

  it('keeps counts and names within bounds', () => {
    const result = build({
      companyName: '   ',
      split: 'country',
      segments: Array.from({ length: 20 }, (_, index) => `C${index}`).join(','),
      inPerson: true,
      storesPerAccount: 99,
      terminalsPerStore: 99,
      platform: true,
      accountHolders: -4,
    });
    expect(result.root.name).toBe('My Company');
    expect(count(result, 'pos')).toBe(GUIDED_LIMITS.segments);
    expect(count(result, 'store')).toBe(GUIDED_LIMITS.segments * GUIDED_LIMITS.storesPerAccount);
    expect(all(result, 'store')[0]?.terminals).toHaveLength(GUIDED_LIMITS.terminalsPerStore);
    expect(count(result, 'accHolder')).toBe(0);
  });
});

describe('templates', () => {
  it('have unique ids and only use integrations and payment methods the tool knows', () => {
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) {
      const { onlineIntegrations, inPersonIntegrations, methods } = template.answers;
      for (const id of [...onlineIntegrations, ...inPersonIntegrations]) expect(isIntegrationId(id), id).toBe(true);
      for (const id of methods) expect(isPaymentMethodId(id), id).toBe(true);
    }
  });

  it.each(TEMPLATES.map((template) => [template.name, template] as const))(
    '%s builds a diagram that survives a round trip unchanged',
    (_, template) => {
      const result = buildFromAnswers(template.answers);
      expect(result.root.children.length).toBeGreaterThan(0);
      for (const kind of template.highlights) expect(count(result, kind), kind).toBeGreaterThan(0);

      // Nothing the builder wrote was dropped by the normaliser on the way in.
      const again = normalizeDocument(JSON.parse(JSON.stringify(result)));
      let before = 0;
      let after = 0;
      forEachNode(result, () => (before += 1));
      forEachNode(again, () => (after += 1));
      expect(after).toBe(before);
      expect(collectLinks(again)).toHaveLength(collectLinks(result).length);
    },
  );
});
