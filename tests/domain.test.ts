import { describe, expect, it } from 'vitest';
import {
  countNodes,
  createDefaultDocument,
  createNode,
  findNode,
  indexDocument,
} from '../src/domain/document';
import { NODE_KINDS, canLink, linkOwnerId, nextVariant, specOf, variantLabel } from '../src/domain/kinds';
import {
  MAX_NAME_LENGTH,
  MAX_VERSION_LENGTH,
  addChild,
  addIntegration,
  addLink,
  addTerminal,
  areLinked,
  canCreateLink,
  canMoveNode,
  kindChangeImpact,
  linkAtLimit,
  linkCandidates,
  moveNode,
  normalizeDomain,
  relinkAtLimit,
  removeIntegrationAt,
  removeNode,
  removeSetting,
  removeTerminalAt,
  renameNode,
  renameSetting,
  setIntegrationVersion,
  setKind,
  setLogoDomain,
  setMethods,
  setNote,
  setSetting,
  toggleLink,
  toggleMethod,
} from '../src/domain/operations';
import { PAYMENT_METHODS } from '../src/domain/paymentMethods';
import { MAX_SETTINGS_PER_NODE, MAX_SETTING_VALUE_LENGTH } from '../src/domain/settings';
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

  // A card's icon is labelled with the type it switches to, so every kind that
  // can be reached by clicking needs a name inside its group.
  it('names every kind that has alternatives', () => {
    expect(variantLabel('pos')).toBe('POS');
    expect(variantLabel('bp')).toBe('Balance platform');
    expect(variantLabel('store')).toBeNull();

    for (const kind of NODE_KINDS) {
      const next = nextVariant(kind);
      if (next === null) continue;
      expect(variantLabel(next), kind).not.toBeNull();
    }
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
  it('attaches to in-person merchant accounts as well as stores', () => {
    const document = doc(node('company', node('pos', node('store'))));
    const [company, merchant, store] = ids(document) as [string, string, string];

    expect(findNode(addTerminal(document, merchant, 'counter'), merchant)?.terminals).toEqual(['counter']);
    expect(findNode(addTerminal(document, store, 'counter'), store)?.terminals).toEqual(['counter']);
    // A company has no terminals of its own; they belong to an account below it.
    expect(findNode(addTerminal(document, company, 'counter'), company)?.terminals).toEqual([]);
  });

  it('refuses kinds that have no terminals', () => {
    const document = doc(node('company', node('ecom')));
    const ecomId = ids(document)[1] as string;

    expect(addTerminal(document, ecomId, 'counter')).toBe(document);
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

describe('settings', () => {
  it('adds a setting and replaces its value where it already sits', () => {
    let document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;

    document = setSetting(document, merchantId, 'captureDelay', 'immediate');
    document = setSetting(document, merchantId, 'shopperStatement', 'ACME NL');
    document = setSetting(document, merchantId, 'captureDelay', 'manual');

    expect(findNode(document, merchantId)?.settings).toEqual([
      { key: 'captureDelay', value: 'manual' },
      { key: 'shopperStatement', value: 'ACME NL' },
    ]);
  });

  it('ignores a key that is empty once trimmed', () => {
    const document = doc(node('company'));
    expect(setSetting(document, document.root.id, '', 'immediate')).toBe(document);
    expect(setSetting(document, document.root.id, '   ', 'immediate')).toBe(document);
  });

  it('caps how many settings one node carries', () => {
    let document = doc(node('company'));
    for (let index = 0; index < MAX_SETTINGS_PER_NODE + 5; index += 1) {
      document = setSetting(document, document.root.id, `key${index}`, 'on');
    }
    expect(document.root.settings).toHaveLength(MAX_SETTINGS_PER_NODE);
  });

  it('collapses newlines and tabs out of a value and caps its length', () => {
    let document = doc(node('company'));

    document = setSetting(document, document.root.id, 'note', ' one\n\ttwo\r\nthree ');
    expect(document.root.settings[0]?.value).toBe('one two three');

    document = setSetting(document, document.root.id, 'note', 'v'.repeat(MAX_SETTING_VALUE_LENGTH + 50));
    expect(document.root.settings[0]?.value).toHaveLength(MAX_SETTING_VALUE_LENGTH);
  });

  it('renames a key without moving it', () => {
    let document = doc(node('company'));
    document = setSetting(document, document.root.id, 'first', '1');
    document = setSetting(document, document.root.id, 'second', '2');

    const renamed = renameSetting(document, document.root.id, 'first', 'captureDelay');
    expect(renamed.root.settings).toEqual([
      { key: 'captureDelay', value: '1' },
      { key: 'second', value: '2' },
    ]);
  });

  it('removes the row when the new key is empty', () => {
    let document = doc(node('company'));
    document = setSetting(document, document.root.id, 'first', '1');
    document = setSetting(document, document.root.id, 'second', '2');

    expect(renameSetting(document, document.root.id, 'first', '  ').root.settings).toEqual([
      { key: 'second', value: '2' },
    ]);
  });

  it('refuses a rename onto a key the node already has', () => {
    let document = doc(node('company'));
    document = setSetting(document, document.root.id, 'first', '1');
    document = setSetting(document, document.root.id, 'second', '2');

    expect(renameSetting(document, document.root.id, 'first', 'second')).toBe(document);
  });

  it('removes a setting by key', () => {
    let document = doc(node('company'));
    document = setSetting(document, document.root.id, 'first', '1');
    document = setSetting(document, document.root.id, 'second', '2');

    expect(removeSetting(document, document.root.id, ' first ').root.settings).toEqual([
      { key: 'second', value: '2' },
    ]);
  });

  it('keeps the same document instance when nothing changes', () => {
    let document = doc(node('company'));
    document = setSetting(document, document.root.id, 'captureDelay', 'immediate');

    expect(setSetting(document, document.root.id, 'captureDelay', 'immediate')).toBe(document);
    expect(renameSetting(document, document.root.id, 'captureDelay', 'captureDelay')).toBe(document);
    expect(renameSetting(document, document.root.id, 'missing', 'other')).toBe(document);
    expect(removeSetting(document, document.root.id, 'missing')).toBe(document);
  });
});

describe('integrations', () => {
  it('lands only on kinds that run an integration', () => {
    const document = doc(node('company', node('pos', node('store')), node('ecom'), node('bp')));
    const [company, merchant, store, online, platform] = ids(document) as [
      string,
      string,
      string,
      string,
      string,
    ];

    for (const id of [merchant, online, platform]) {
      expect(specOf(findNode(document, id)?.kind ?? 'company').supportsIntegrations).toBe(true);
      expect(findNode(addIntegration(document, id, 'webDropin'), id)?.integrations).toEqual([
        { id: 'webDropin', version: '' },
      ]);
    }
    for (const id of [company, store]) {
      expect(addIntegration(document, id, 'webDropin')).toBe(document);
    }
  });

  it('ignores an id that is empty once trimmed', () => {
    const document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;
    expect(addIntegration(document, merchantId, '   ')).toBe(document);
  });

  it('lists an id once per version', () => {
    let document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;

    document = addIntegration(document, merchantId, 'webDropin', 'v6');
    expect(addIntegration(document, merchantId, 'webDropin', 'v6')).toBe(document);

    document = addIntegration(document, merchantId, 'webDropin', 'v5.x');
    expect(findNode(document, merchantId)?.integrations).toEqual([
      { id: 'webDropin', version: 'v6' },
      { id: 'webDropin', version: 'v5.x' },
    ]);
  });

  it('caps and trims the version', () => {
    let document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;

    document = addIntegration(document, merchantId, 'apiOnly', 'v'.repeat(MAX_VERSION_LENGTH + 10));
    expect(findNode(document, merchantId)?.integrations[0]?.version).toHaveLength(MAX_VERSION_LENGTH);

    document = setIntegrationVersion(document, merchantId, 0, '  v71  ');
    expect(findNode(document, merchantId)?.integrations[0]?.version).toBe('v71');
  });

  it('ignores positions outside the list', () => {
    let document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;
    document = addIntegration(document, merchantId, 'apiOnly');

    expect(setIntegrationVersion(document, merchantId, 3, 'v71')).toBe(document);
    expect(setIntegrationVersion(document, merchantId, -1, 'v71')).toBe(document);
    expect(removeIntegrationAt(document, merchantId, 3)).toBe(document);
    expect(removeIntegrationAt(document, merchantId, -1)).toBe(document);
    expect(findNode(removeIntegrationAt(document, merchantId, 0), merchantId)?.integrations).toEqual([]);
  });
});

describe('payment methods', () => {
  it('rejects a method that is not in the registry', () => {
    const document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;
    expect(toggleMethod(document, merchantId, 'not-a-method')).toBe(document);
  });

  it('toggles a method on and off again', () => {
    const document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;
    const method = PAYMENT_METHODS[0]?.id as string;

    const enabled = toggleMethod(document, merchantId, method);
    expect(findNode(enabled, merchantId)?.methods).toEqual([method]);
    expect(findNode(toggleMethod(enabled, merchantId, method), merchantId)?.methods).toEqual([]);
  });

  it('filters unknown ids out of a bulk set', () => {
    const document = doc(node('company', node('pos')));
    const merchantId = ids(document)[1] as string;

    const next = setMethods(document, merchantId, ['visa', 'not-a-method', 'mc']);
    expect(findNode(next, merchantId)?.methods).toEqual(['visa', 'mc']);
  });

  it('leaves kinds that carry no methods alone', () => {
    const document = doc(node('company', node('bp')));
    const platformId = ids(document)[1] as string;

    expect(specOf('bp').supportsMethods).toBe(false);
    expect(toggleMethod(document, platformId, 'visa')).toBe(document);
    expect(setMethods(document, platformId, ['visa'])).toBe(document);
  });
});

describe('logo domain', () => {
  it('reduces a pasted address to a bare domain', () => {
    expect(normalizeDomain('https://www.Acme.com/path?x=1')).toBe('acme.com');
  });

  it('rejects anything that is not a domain', () => {
    expect(normalizeDomain('nodot')).toBe('');
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
    expect(normalizeDomain('localhost')).toBe('');
  });

  it('is stored only on kinds that can show a logo', () => {
    const document = doc(node('company', node('pos', node('store'))));
    const [company, merchant, store] = ids(document) as [string, string, string];

    expect(setLogoDomain(document, company, 'https://acme.com').root.logoDomain).toBe('acme.com');
    expect(findNode(setLogoDomain(document, merchant, 'acme.com'), merchant)?.logoDomain).toBe('acme.com');
    expect(specOf('store').supportsLogo).toBe(false);
    expect(setLogoDomain(document, store, 'acme.com')).toBe(document);
  });
});

describe('link cardinality', () => {
  it('gives a merchant account at most one balance platform', () => {
    let document = doc(node('company', node('pos'), named('bp', 'Platform A'), named('bp', 'Platform B')));
    const merchantId = ids(document)[1] as string;
    const platformA = byName(document, 'Platform A');
    const platformB = byName(document, 'Platform B');

    document = addLink(document, merchantId, platformA.id);
    expect(areLinked(document, merchantId, platformA.id)).toBe(true);

    expect(canCreateLink(document, merchantId, platformB.id)).toBe(false);
    expect(linkAtLimit(document, merchantId, platformB.id)).toBe(platformA.id);
    expect(addLink(document, merchantId, platformB.id)).toBe(document);
  });

  it('swaps the platform rather than adding a second one', () => {
    let document = doc(node('company', node('pos'), named('bp', 'Platform A'), named('bp', 'Platform B')));
    const merchantId = ids(document)[1] as string;
    const platformA = byName(document, 'Platform A');
    const platformB = byName(document, 'Platform B');

    document = relinkAtLimit(document, merchantId, platformA.id);
    document = relinkAtLimit(document, merchantId, platformB.id);

    expect(findNode(document, merchantId)?.links).toEqual([platformB.id]);
    expect(areLinked(document, merchantId, platformA.id)).toBe(false);
  });

  it('lets several merchant accounts feed the same platform', () => {
    let document = doc(node('company', named('pos', 'Retail'), named('ecom', 'Webshop'), named('bp', 'Platform')));
    const retail = byName(document, 'Retail');
    const webshop = byName(document, 'Webshop');
    const platform = byName(document, 'Platform');

    document = addLink(document, retail.id, platform.id);
    expect(canCreateLink(document, webshop.id, platform.id)).toBe(true);
    expect(linkAtLimit(document, webshop.id, platform.id)).toBeNull();

    document = addLink(document, webshop.id, platform.id);
    expect(areLinked(document, retail.id, platform.id)).toBe(true);
    expect(areLinked(document, webshop.id, platform.id)).toBe(true);
  });

  it('does not link one balance platform to another', () => {
    const document = doc(node('company', named('bp', 'Platform A'), named('bp', 'Platform B')));
    const platformA = byName(document, 'Platform A');
    const platformB = byName(document, 'Platform B');

    expect(canLink('bp', 'bp')).toBe(false);
    expect(canCreateLink(document, platformA.id, platformB.id)).toBe(false);
    expect(addLink(document, platformA.id, platformB.id)).toBe(document);
  });
});
