import { describe, expect, it } from 'vitest';
import {
  countNodes,
  createDefaultDocument,
  createNode,
  findNode,
  indexDocument,
} from '../src/domain/document';
import { canLink, linkOwnerId, nextVariant, specOf } from '../src/domain/kinds';
import {
  MAX_NAME_LENGTH,
  addChild,
  addLink,
  addTerminal,
  areLinked,
  canCreateLink,
  canMoveNode,
  kindChangeImpact,
  linkCandidates,
  moveNode,
  removeNode,
  removeTerminalAt,
  renameNode,
  setKind,
  setNote,
  toggleLink,
} from '../src/domain/operations';
import { byName, doc, ids, kinds, named, node } from './helpers';

describe('default document', () => {
  it('is a company with one merchant account and one store', () => {
    const document = createDefaultDocument();
    expect(kinds(document)).toEqual(['company', 'pos', 'store']);
    expect(countNodes(document)).toBe(3);
    expect(specOf(document.root.kind).isRoot).toBe(true);
  });
});

describe('addChild', () => {
  it('creates the first allowed kind when none is given', () => {
    const document = doc(node('company'));
    const { doc: next, createdId } = addChild(document, document.root.id);
    expect(createdId).not.toBeNull();
    expect(kinds(next)).toEqual(['company', 'pos']);
  });

  it('yields the liable account holder first and standard holders afterwards', () => {
    let document = doc(node('company', node('bp')));
    const platformId = ids(document)[1] as string;

    document = addChild(document, platformId).doc;
    document = addChild(document, platformId).doc;
    expect(kinds(document)).toEqual(['company', 'bp', 'liableAccHolder', 'accHolder']);
  });

  it('refuses a kind the parent cannot hold', () => {
    const document = doc(node('company'));
    const result = addChild(document, document.root.id, 'store');
    expect(result.createdId).toBeNull();
    expect(result.doc).toBe(document);
  });

  it('enforces child limits', () => {
    let document = doc(node('company', node('bp', node('accHolder'))));
    const holderId = ids(document)[2] as string;

    document = addChild(document, holderId, 'legalEntity').doc;
    const blocked = addChild(document, holderId, 'legalEntity');
    expect(blocked.createdId).toBeNull();
    expect(kinds(document).filter((kind) => kind === 'legalEntity')).toHaveLength(1);
  });
});

describe('removeNode', () => {
  it('removes the whole subtree', () => {
    const document = doc(node('company', node('pos', node('store'))));
    const merchantId = ids(document)[1] as string;
    const next = removeNode(document, merchantId);
    expect(kinds(next)).toEqual(['company']);
  });

  it('never removes the root', () => {
    const document = createDefaultDocument();
    expect(removeNode(document, document.root.id)).toBe(document);
  });

  it('drops links that pointed at the removed subtree', () => {
    let document = doc(node('company', node('pos'), node('pos')));
    const [, first, second] = ids(document) as [string, string, string];
    document = addLink(document, first, second);
    expect(areLinked(document, first, second)).toBe(true);

    const next = removeNode(document, second);
    expect(findNode(next, first)?.links).toEqual([]);
  });
});

describe('renameNode and setNote', () => {
  it('collapses whitespace and falls back to the default name', () => {
    const document = doc(node('company', node('store')));
    const storeId = ids(document)[1] as string;

    expect(findNode(renameNode(document, storeId, '  Kalverstraat  1 '), storeId)?.name).toBe('Kalverstraat 1');
    expect(findNode(renameNode(document, storeId, '   '), storeId)?.name).toBe('Store');
  });

  it('caps the name length', () => {
    const document = doc(node('company'));
    const renamed = renameNode(document, document.root.id, 'x'.repeat(500));
    expect(renamed.root.name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('keeps the same document instance when nothing changes', () => {
    const document = doc(node('company'));
    expect(renameNode(document, document.root.id, 'My Company')).toBe(document);
    expect(setNote(document, document.root.id, '')).toBe(document);
  });
});

describe('setKind', () => {
  it('drops children the new kind cannot hold, and reports it first', () => {
    const document = doc(node('company', node('pos', node('store'), node('store'))));
    const merchantId = ids(document)[1] as string;

    expect(kindChangeImpact(document, merchantId, 'ecom')).toEqual({
      droppedChildren: 2,
      droppedDescendants: 2,
      droppedLinks: 0,
    });

    const next = setKind(document, merchantId, 'ecom');
    expect(kinds(next)).toEqual(['company', 'ecom']);
  });

  it('renames only while the name is still the default', () => {
    const document = doc(node('company', node('pos'), named('pos', 'Kiosks')));
    const [, standard, custom] = ids(document) as [string, string, string];

    expect(findNode(setKind(document, standard, 'ecom'), standard)?.name).toBe('Ecom');
    expect(findNode(setKind(document, custom, 'ecom'), custom)?.name).toBe('Kiosks');
  });

  it('leaves the root alone', () => {
    const document = createDefaultDocument();
    expect(setKind(document, document.root.id, 'pos')).toBe(document);
  });

  it('prunes links the new kind cannot carry', () => {
    let document = doc(
      node('company', node('pos', node('store')), node('bp', node('accHolder', node('legalEntity', node('businessLine'))))),
    );
    const store = byName(document, 'Store');
    const line = byName(document, 'Business Line');

    document = addLink(document, line.id, store.id);
    expect(areLinked(document, line.id, store.id)).toBe(true);

    expect(kindChangeImpact(document, line.id, 'transferInst').droppedLinks).toBe(1);
    const next = setKind(document, line.id, 'transferInst');
    expect(areLinked(next, line.id, store.id)).toBe(false);
  });

  it('cycles through the variants of a group', () => {
    expect(nextVariant('pos')).toBe('ecom');
    expect(nextVariant('ecom')).toBe('bp');
    expect(nextVariant('bp')).toBe('pos');
    expect(nextVariant('store')).toBeNull();
  });
});

describe('links', () => {
  it('stores a pair on one side only', () => {
    const document = doc(node('company', node('pos'), node('pos')));
    const [, first, second] = ids(document) as [string, string, string];

    const next = addLink(document, second, first);
    const owner = linkOwnerId(first, 'pos', second, 'pos');
    expect(owner).not.toBeNull();
    expect(findNode(next, owner?.ownerId ?? '')?.links).toEqual([owner?.targetId]);
    expect(findNode(next, owner?.targetId ?? '')?.links).toEqual([]);
    expect(areLinked(next, first, second)).toBe(true);
  });

  it('refuses pairs the rules do not allow', () => {
    const document = doc(node('company', node('pos', node('store'))));
    const [company, merchant, store] = ids(document) as [string, string, string];

    expect(canLink('company', 'pos')).toBe(false);
    expect(canCreateLink(document, company, merchant)).toBe(false);
    expect(canCreateLink(document, merchant, store)).toBe(false);
    expect(canCreateLink(document, merchant, merchant)).toBe(false);
    expect(addLink(document, company, merchant)).toBe(document);
  });

  it('does not add the same pair twice', () => {
    let document = doc(node('company', node('pos'), node('ecom')));
    const [, first, second] = ids(document) as [string, string, string];

    document = addLink(document, first, second);
    expect(canCreateLink(document, second, first)).toBe(false);
    expect(addLink(document, second, first)).toBe(document);
  });

  it('toggles a pair off again', () => {
    const document = doc(node('company', node('pos'), node('pos')));
    const [, first, second] = ids(document) as [string, string, string];

    const linked = toggleLink(document, first, second);
    const unlinked = toggleLink(linked, second, first);
    expect(areLinked(unlinked, first, second)).toBe(false);
  });

  it('offers only compatible candidates', () => {
    const document = doc(node('company', node('pos', node('store')), node('ecom'), node('bp')));
    const merchantId = ids(document)[1] as string;
    const candidateKinds = linkCandidates(document, merchantId).map((candidate) => candidate.kind);
    expect(new Set(candidateKinds)).toEqual(new Set(['ecom', 'bp']));
  });
});

describe('moveNode', () => {
  it('reorders siblings', () => {
    const document = doc(node('company', named('pos', 'A'), named('pos', 'B'), named('pos', 'C')));
    const a = byName(document, 'A');
    const c = byName(document, 'C');

    const next = moveNode(document, c.id, a.id, 'before');
    expect(next.root.children.map((child) => child.name)).toEqual(['C', 'A', 'B']);
  });

  it('reparents into another node', () => {
    const document = doc(node('company', named('pos', 'A', named('store', 'Shop')), named('pos', 'B')));
    const shop = byName(document, 'Shop');
    const b = byName(document, 'B');

    const next = moveNode(document, shop.id, b.id, 'inside');
    expect(byName(next, 'A').children).toHaveLength(0);
    expect(byName(next, 'B').children.map((child) => child.name)).toEqual(['Shop']);
  });

  it('refuses illegal moves', () => {
    const document = doc(node('company', named('pos', 'A', named('store', 'Shop')), named('bp', 'Platform')));
    const a = byName(document, 'A');
    const shop = byName(document, 'Shop');
    const platform = byName(document, 'Platform');

    // The root cannot move.
    expect(canMoveNode(document, document.root.id, a.id, 'inside')).toBe(false);
    // A node cannot move into its own subtree.
    expect(canMoveNode(document, a.id, shop.id, 'inside')).toBe(false);
    // A balance platform does not accept stores.
    expect(canMoveNode(document, shop.id, platform.id, 'inside')).toBe(false);
    expect(moveNode(document, shop.id, platform.id, 'inside')).toBe(document);
  });

  it('respects child limits when reparenting', () => {
    const document = doc(
      node(
        'company',
        node('bp', named('accHolder', 'Holder A', named('legalEntity', 'LE A')), named('accHolder', 'Holder B', named('legalEntity', 'LE B'))),
      ),
    );
    const leA = byName(document, 'LE A');
    const holderB = byName(document, 'Holder B');

    expect(canMoveNode(document, leA.id, holderB.id, 'inside')).toBe(false);
  });

  it('keeps a reorder inside the same parent legal even at the limit', () => {
    const document = doc(node('company', node('bp', named('liableAccHolder', 'Liable'), named('accHolder', 'Standard'))));
    const liable = byName(document, 'Liable');
    const standard = byName(document, 'Standard');

    expect(canMoveNode(document, liable.id, standard.id, 'after')).toBe(true);
    const next = moveNode(document, liable.id, standard.id, 'after');
    expect(byName(next, 'Balance Platform').children.map((child) => child.name)).toEqual(['Standard', 'Liable']);
  });
});

describe('terminals', () => {
  it('only attaches to kinds that support them', () => {
    const document = doc(node('company', node('pos', node('store'))));
    const [, merchant, store] = ids(document) as [string, string, string];

    expect(findNode(addTerminal(document, merchant, 'counter'), merchant)?.terminals).toEqual([]);
    const withTerminal = addTerminal(document, store, 'counter');
    expect(findNode(withTerminal, store)?.terminals).toEqual(['counter']);
  });

  it('removes a terminal by position', () => {
    let document = doc(node('company', node('pos', node('store'))));
    const storeId = ids(document)[2] as string;
    document = addTerminal(document, storeId, 'counter');
    document = addTerminal(document, storeId, 'mobile');

    expect(findNode(removeTerminalAt(document, storeId, 0), storeId)?.terminals).toEqual(['mobile']);
    expect(removeTerminalAt(document, storeId, 7)).toBe(document);
  });

  it('drops terminals when the kind stops supporting them', () => {
    let document = doc(node('company', node('bp', node('accHolder', node('balanceAcc')))));
    const accountId = ids(document)[3] as string;
    document = addTerminal(document, accountId, 'counter');
    expect(findNode(document, accountId)?.terminals).toEqual([]);
  });
});

describe('indexDocument', () => {
  it('records parents, depth and position', () => {
    const document = doc(node('company', node('pos', node('store')), node('ecom')));
    const index = indexDocument(document);
    const [, merchant, store, online] = ids(document) as [string, string, string, string];

    expect(index.get(document.root.id)?.depth).toBe(0);
    expect(index.get(store)?.depth).toBe(2);
    expect(index.get(store)?.parent?.id).toBe(merchant);
    expect(index.get(online)?.index).toBe(1);
  });
});

describe('createNode', () => {
  it('applies the kind default name', () => {
    expect(createNode('grantRef').name).toBe('Grant Reference');
  });
});
