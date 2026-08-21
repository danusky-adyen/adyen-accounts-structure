import { describe, expect, it } from 'vitest';
import { countNodes, forEachNode, type StructureDocument } from '../src/domain/document';
import { MAX_NAME_LENGTH, MAX_NOTE_LENGTH, areLinked } from '../src/domain/operations';
import { normalizeDocument, normalizeKind } from '../src/domain/normalize';
import { MAX_SETTINGS_PER_NODE } from '../src/domain/settings';
import { byName, kinds } from './helpers';

function allIds(document: StructureDocument): string[] {
  const collected: string[] = [];
  forEachNode(document, (node) => collected.push(node.id));
  return collected;
}

describe('normalizeDocument', () => {
  it('turns anything unusable into a fresh company account', () => {
    for (const input of [null, undefined, 42, 'nope', [], {}]) {
      const document = normalizeDocument(input);
      expect(kinds(document)).toEqual(['company']);
    }
  });

  it('forces the root to be a company account', () => {
    const document = normalizeDocument({ root: { kind: 'store', name: 'Not a company' } });
    expect(document.root.kind).toBe('company');
    expect(document.root.name).toBe('Not a company');
  });

  it('accepts a bare node as the document', () => {
    const document = normalizeDocument({ kind: 'company', children: [{ kind: 'pos' }] });
    expect(kinds(document)).toEqual(['company', 'pos']);
  });

  it('drops children the parent cannot hold, with their subtrees', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { kind: 'store', children: [{ kind: 'store' }] },
          { kind: 'pos', children: [{ kind: 'store' }, { kind: 'bp' }] },
        ],
      },
    });
    expect(kinds(document)).toEqual(['company', 'pos', 'store']);
  });

  it('enforces child limits', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          {
            kind: 'bp',
            children: [{ kind: 'liableAccHolder' }, { kind: 'liableAccHolder' }, { kind: 'accHolder' }],
          },
        ],
      },
    });
    expect(kinds(document)).toEqual(['company', 'bp', 'liableAccHolder', 'accHolder']);
  });

  it('keeps terminals only where they are supported, and only known ones', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        terminals: ['counter'],
        children: [
          {
            kind: 'pos',
            terminals: ['counter'],
            children: [{ kind: 'store', terminals: ['counter', 'nope', 7, 'mobile'] }],
          },
          { kind: 'ecom', terminals: ['counter'] },
        ],
      },
    });
    expect(byName(document, 'My Company').terminals).toEqual([]);
    expect(byName(document, 'Ecom').terminals).toEqual([]);
    expect(byName(document, 'POS').terminals).toEqual(['counter']);
    expect(byName(document, 'Store').terminals).toEqual(['counter', 'mobile']);
  });

  it('cleans names and notes', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        name: `Acme\u0000\tGroup   Holding`,
        note: 'n'.repeat(MAX_NOTE_LENGTH + 500),
        children: [
          { kind: 'pos', name: '' },
          { kind: 'pos', name: 'x'.repeat(MAX_NAME_LENGTH + 50) },
          { kind: 'pos', name: 42 },
        ],
      },
    });

    expect(document.root.name).toBe('Acme Group Holding');
    expect(document.root.note).toHaveLength(MAX_NOTE_LENGTH);
    const names = document.root.children.map((child) => child.name);
    expect(names[0]).toBe('POS');
    expect(names[1]).toHaveLength(MAX_NAME_LENGTH);
    expect(names[2]).toBe('POS');
  });

  it('gives every node a fresh unique id', () => {
    const document = normalizeDocument({
      root: {
        id: 'same',
        kind: 'company',
        children: [
          { id: 'same', kind: 'pos' },
          { id: 'same', kind: 'pos' },
        ],
      },
    });
    const seen = allIds(document);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('resolves links written with the ids of the incoming document', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'old-a', kind: 'pos', name: 'A', links: ['old-b'] },
          { id: 'old-b', kind: 'pos', name: 'B' },
        ],
      },
    });

    const a = byName(document, 'A');
    const b = byName(document, 'B');
    expect(areLinked(document, a.id, b.id)).toBe(true);
    // Exactly one side owns the pair.
    expect(a.links.length + b.links.length).toBe(1);
  });

  it('drops links to unknown or incompatible nodes', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'a', kind: 'pos', name: 'A', links: ['ghost', 'a', 'store-1'] },
          { id: 'store-1', kind: 'store' },
        ],
      },
    });
    expect(byName(document, 'A').links).toEqual([]);
  });

  it('stores a pair once even when both sides declare it', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'a', kind: 'pos', name: 'A', links: ['b', 'b'] },
          { id: 'b', kind: 'pos', name: 'B', links: ['a'] },
        ],
      },
    });

    const a = byName(document, 'A');
    const b = byName(document, 'B');
    expect(a.links.length + b.links.length).toBe(1);
  });

  it('ignores malformed children instead of failing', () => {
    const document = normalizeDocument({
      root: { kind: 'company', children: ['nope', null, 7, { kind: 'pos' }, { kind: 'unknown' }] },
    });
    expect(kinds(document)).toEqual(['company', 'pos']);
    expect(countNodes(document)).toBe(2);
  });
});

describe('normalizeDocument settings', () => {
  it('accepts the array form and drops empty or repeated keys', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        settings: [
          { key: ' captureDelay ', value: ' immediate ' },
          { key: '  ', value: 'orphan' },
          { key: 'captureDelay', value: 'manual' },
          'nope',
          null,
        ],
      },
    });

    expect(document.root.settings).toEqual([{ key: 'captureDelay', value: 'immediate' }]);
  });

  it('accepts the object form and stringifies numbers and booleans', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [{ kind: 'pos', settings: { shopperStatement: 'ACME NL', retries: 3, live: true } }],
      },
    });

    expect(byName(document, 'POS').settings).toEqual([
      { key: 'shopperStatement', value: 'ACME NL' },
      { key: 'retries', value: '3' },
      { key: 'live', value: 'true' },
    ]);
  });

  it('caps how many settings one node keeps', () => {
    const many: Record<string, string> = {};
    for (let index = 0; index < MAX_SETTINGS_PER_NODE + 10; index += 1) many[`key${index}`] = 'on';

    const document = normalizeDocument({ root: { kind: 'company', settings: many } });
    expect(document.root.settings).toHaveLength(MAX_SETTINGS_PER_NODE);
  });
});

describe('normalizeDocument integrations, methods and logos', () => {
  it('accepts a bare id or an id with a version, only where integrations are supported', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        integrations: ['webDropin'],
        children: [
          {
            kind: 'pos',
            integrations: ['webDropin', { id: 'apiOnly', version: 'v71' }, 'webDropin', { id: '' }, 7],
          },
          { kind: 'pos', name: 'Second', integrations: 'not-a-list' },
        ],
      },
    });

    expect(document.root.integrations).toEqual([]);
    expect(byName(document, 'POS').integrations).toEqual([
      { id: 'webDropin', version: '' },
      { id: 'apiOnly', version: 'v71' },
    ]);
    expect(byName(document, 'Second').integrations).toEqual([]);
  });

  it('keeps only known payment methods, once each, where they are supported', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        methods: ['visa'],
        children: [
          {
            kind: 'pos',
            methods: ['visa', 'not-a-method', 'visa', 7, 'mc'],
            children: [{ kind: 'store', methods: ['ideal'] }],
          },
          { kind: 'bp', name: 'Platform', methods: ['visa'] },
        ],
      },
    });

    expect(document.root.methods).toEqual([]);
    expect(byName(document, 'POS').methods).toEqual(['visa', 'mc']);
    expect(byName(document, 'Store').methods).toEqual(['ideal']);
    expect(byName(document, 'Platform').methods).toEqual([]);
  });

  it('reduces a logo domain and keeps it only where a logo can show', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        logoDomain: 'HTTPS://www.Acme.com/about',
        children: [{ kind: 'pos', logoDomain: 'nodot', children: [{ kind: 'store', logoDomain: 'shop.acme.com' }] }],
      },
    });

    expect(document.root.logoDomain).toBe('acme.com');
    expect(byName(document, 'POS').logoDomain).toBe('');
    expect(byName(document, 'Store').logoDomain).toBe('');
  });
});

describe('normalizeDocument link cardinality', () => {
  it('keeps only the first balance platform a merchant account claims', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'm', kind: 'pos', name: 'Retail', links: ['p1', 'p2'] },
          { id: 'p1', kind: 'bp', name: 'Platform A' },
          { id: 'p2', kind: 'bp', name: 'Platform B' },
        ],
      },
    });

    const retail = byName(document, 'Retail');
    expect(retail.links).toHaveLength(1);
    expect(areLinked(document, retail.id, byName(document, 'Platform A').id)).toBe(true);
    expect(areLinked(document, retail.id, byName(document, 'Platform B').id)).toBe(false);
  });

  it('still lets two merchant accounts claim the same platform', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'm1', kind: 'pos', name: 'Retail', links: ['p'] },
          { id: 'm2', kind: 'ecom', name: 'Webshop', links: ['p'] },
          { id: 'p', kind: 'bp', name: 'Platform' },
        ],
      },
    });

    const platform = byName(document, 'Platform');
    expect(areLinked(document, byName(document, 'Retail').id, platform.id)).toBe(true);
    expect(areLinked(document, byName(document, 'Webshop').id, platform.id)).toBe(true);
  });

  it('drops a link between two balance platforms', () => {
    const document = normalizeDocument({
      root: {
        kind: 'company',
        children: [
          { id: 'a', kind: 'bp', name: 'Platform A', links: ['b'] },
          { id: 'b', kind: 'bp', name: 'Platform B' },
        ],
      },
    });

    expect(byName(document, 'Platform A').links).toEqual([]);
    expect(areLinked(document, byName(document, 'Platform A').id, byName(document, 'Platform B').id)).toBe(false);
  });
});

describe('normalizeKind', () => {
  it('accepts current kinds', () => {
    expect(normalizeKind('balanceAcc')).toBe('balanceAcc');
  });

  it('maps kinds the previous version used', () => {
    expect(normalizeKind('liableBalanceAcc')).toBe('balanceAcc');
    expect(normalizeKind('merchant')).toBe('pos');
    expect(normalizeKind('accountHolder')).toBe('accHolder');
    expect(normalizeKind('liableAccountHolder')).toBe('liableAccHolder');
    expect(normalizeKind('transferInstrument')).toBe('transferInst');
    expect(normalizeKind('paymentInstrument')).toBe('payInstCard');
  });

  it('rejects everything else', () => {
    expect(normalizeKind('wat')).toBeNull();
    expect(normalizeKind(null)).toBeNull();
    expect(normalizeKind(3)).toBeNull();
  });
});
