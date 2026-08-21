import { describe, expect, it } from 'vitest';
import { countNodes, forEachNode, type StructureDocument } from '../src/domain/document';
import { MAX_NAME_LENGTH, MAX_NOTE_LENGTH, areLinked } from '../src/domain/operations';
import { normalizeDocument, normalizeKind } from '../src/domain/normalize';
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
        children: [
          {
            kind: 'pos',
            terminals: ['counter'],
            children: [{ kind: 'store', terminals: ['counter', 'nope', 7, 'mobile'] }],
          },
        ],
      },
    });
    expect(byName(document, 'POS').terminals).toEqual([]);
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
