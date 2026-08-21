import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import {
  countNodes,
  createDefaultDocument,
  forEachNode,
  type StructureDocument,
} from '../src/domain/document';
import { addLink, addTerminal, areLinked, setNote } from '../src/domain/operations';
import { decodeDocument, encodeDocument } from '../src/share/codec';
import { decodeLegacyShareLink } from '../src/share/legacy';
import { buildShareUrl, readSharedDocument } from '../src/share/url';
import { byName, doc, ids, named, node } from './helpers';

/** A structure with enough variety to be worth measuring. */
function sampleDocument(): StructureDocument {
  let document = doc(
    node(
      'company',
      named('pos', 'Retail NL', named('store', 'Kalverstraat'), named('store', 'Rokin')),
      named('pos', 'Retail BE', named('store', 'Rue Neuve')),
      named('ecom', 'Webshop'),
      named(
        'bp',
        'Marketplace',
        named(
          'liableAccHolder',
          'Platform Ltd',
          named('legalEntity', 'Platform Legal', named('businessLine', 'Marketplace line'), named('transferInst', 'ING payout')),
          named('balanceAcc', 'Liable balance', named('payInstCard', 'Ops card')),
        ),
        named('accHolder', 'Seller One', named('balanceAcc', 'Seller balance', named('payInstBiz', 'Seller IBAN'))),
      ),
    ),
  );

  const kalverstraat = byName(document, 'Kalverstraat');
  document = addTerminal(document, kalverstraat.id, 'counter');
  document = addTerminal(document, kalverstraat.id, 'counter');
  document = addTerminal(document, kalverstraat.id, 'mobile');
  document = setNote(document, byName(document, 'Webshop').id, 'Live since 2019');
  document = addLink(document, byName(document, 'Retail NL').id, byName(document, 'Webshop').id);
  document = addLink(document, byName(document, 'Retail BE').id, byName(document, 'Marketplace').id);
  document = addLink(document, byName(document, 'Marketplace line').id, kalverstraat.id);
  return document;
}

interface Shape {
  kind: string;
  name: string;
  note: string;
  terminals: readonly string[];
  children: Shape[];
}

function shapeOf(document: StructureDocument): Shape {
  const visit = (current: StructureDocument['root']): Shape => ({
    kind: current.kind,
    name: current.name,
    note: current.note,
    terminals: [...current.terminals],
    children: current.children.map(visit),
  });
  return visit(document.root);
}

/** The `#cfg=` payload the previous version produced, for size comparison. */
function encodeLegacyV1(document: StructureDocument): string {
  const legacyIds = new Map<string, string>();
  let counter = 0;
  forEachNode(document, (current) => {
    counter += 1;
    // The old ids were `node_` plus a 9-character random suffix.
    legacyIds.set(current.id, `node_${counter.toString(36).padStart(9, 'x')}`);
  });

  const convert = (current: StructureDocument['root']): unknown => ({
    id: legacyIds.get(current.id),
    t: current.kind,
    n: current.name,
    nt: current.note,
    tm: current.terminals.join(','),
    lt: current.links.map((target) => legacyIds.get(target) ?? '').join(','),
    c: current.children.map(convert),
  });

  return LZString.compressToEncodedURIComponent(JSON.stringify(convert(document.root)));
}

describe('share codec v2', () => {
  it('round-trips a document', () => {
    const original = sampleDocument();
    const decoded = decodeDocument(encodeDocument(original));

    expect(decoded).not.toBeNull();
    expect(shapeOf(decoded as StructureDocument)).toEqual(shapeOf(original));
    expect(countNodes(decoded as StructureDocument)).toBe(countNodes(original));
  });

  it('keeps cross-links', () => {
    const original = sampleDocument();
    const decoded = decodeDocument(encodeDocument(original)) as StructureDocument;

    expect(areLinked(decoded, byName(decoded, 'Retail NL').id, byName(decoded, 'Webshop').id)).toBe(true);
    expect(areLinked(decoded, byName(decoded, 'Retail BE').id, byName(decoded, 'Marketplace').id)).toBe(true);
    expect(areLinked(decoded, byName(decoded, 'Marketplace line').id, byName(decoded, 'Kalverstraat').id)).toBe(true);
  });

  it('keeps terminals, including repeats', () => {
    const decoded = decodeDocument(encodeDocument(sampleDocument())) as StructureDocument;
    expect(byName(decoded, 'Kalverstraat').terminals).toEqual(['counter', 'counter', 'mobile']);
  });

  it('omits defaults, so an untouched diagram is a very short link', () => {
    expect(encodeDocument(createDefaultDocument()).length).toBeLessThan(40);
  });

  it('is much shorter than the format the previous version used', () => {
    const document = sampleDocument();
    const v2 = encodeDocument(document);
    const v1 = encodeLegacyV1(document);

    // Recorded so a regression in payload size shows up as a failing test.
    expect(v2.length).toBeLessThan(v1.length * 0.5);
    expect(v2.length + 'https://example.com/#d='.length).toBeLessThan(400);
  });

  it('rejects anything that is not a v2 payload', () => {
    expect(decodeDocument('')).toBeNull();
    expect(decodeDocument('not-compressed-at-all')).toBeNull();
    expect(decodeDocument(LZString.compressToEncodedURIComponent('{'))).toBeNull();
    expect(decodeDocument(LZString.compressToEncodedURIComponent('[1,[0]]'))).toBeNull();
    expect(decodeDocument(LZString.compressToEncodedURIComponent('[2,["nope"]]'))).toBeNull();
  });

  it('ignores link indices that point nowhere', () => {
    const payload = LZString.compressToEncodedURIComponent(JSON.stringify([2, [0, 0, [[1], [1]]], [0, 99, 1, 2]]));
    const decoded = decodeDocument(payload);
    expect(decoded).not.toBeNull();
    const document = decoded as StructureDocument;
    const [, first, second] = ids(document) as [string, string, string];
    expect(areLinked(document, first, second)).toBe(true);
  });
});

describe('legacy share links', () => {
  it('reads the #cfg= format', () => {
    const original = sampleDocument();
    const decoded = decodeLegacyShareLink(encodeLegacyV1(original));

    expect(decoded).not.toBeNull();
    const document = decoded as StructureDocument;
    expect(shapeOf(document)).toEqual(shapeOf(original));
    expect(areLinked(document, byName(document, 'Retail NL').id, byName(document, 'Webshop').id)).toBe(true);
  });

  it('reads the oldest company/merchant/store format', () => {
    const payload = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        c: 'Old Company',
        cn: 'Imported',
        m: [
          { t: 0, n: 'In person', s: [{ n: 'Shop 1', tm: 'counter,mobile' }, { n: 'Shop 2' }] },
          { t: 1, n: 'Online' },
        ],
      }),
    );

    const decoded = decodeLegacyShareLink(payload);
    expect(decoded).not.toBeNull();
    const document = decoded as StructureDocument;

    expect(document.root.name).toBe('Old Company');
    expect(document.root.note).toBe('Imported');
    expect(document.root.children.map((child) => child.kind)).toEqual(['pos', 'ecom']);
    expect(byName(document, 'Shop 1').terminals).toEqual(['counter', 'mobile']);
  });

  it('maps kinds that no longer exist', () => {
    const payload = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        t: 'company',
        n: 'Aliased',
        c: [
          {
            t: 'bp',
            c: [
              {
                t: 'liableAccountHolder',
                c: [{ t: 'liableBalanceAcc', n: 'Liable balance' }, { t: 'legalEntity' }],
              },
            ],
          },
          { t: 'merchant', n: 'Old merchant' },
        ],
      }),
    );

    const decoded = decodeLegacyShareLink(payload) as StructureDocument;
    expect(byName(decoded, 'Liable balance').kind).toBe('balanceAcc');
    expect(byName(decoded, 'Old merchant').kind).toBe('pos');
    expect(byName(decoded, 'Liable Account Holder').kind).toBe('liableAccHolder');
  });

  it('rejects junk', () => {
    expect(decodeLegacyShareLink('')).toBeNull();
    expect(decodeLegacyShareLink('%%%')).toBeNull();
    expect(decodeLegacyShareLink(LZString.compressToEncodedURIComponent('[]'))).toBeNull();
    expect(decodeLegacyShareLink(LZString.compressToEncodedURIComponent('{"t":"nope"}'))).toBeNull();
  });
});

describe('share urls', () => {
  it('writes the current format into the hash', () => {
    const document = sampleDocument();
    const url = buildShareUrl(document, new URL('https://example.com/tool/?utm=1#d=stale'));

    expect(url.startsWith('https://example.com/tool/?utm=1#d=')).toBe(true);
    const shared = readSharedDocument(new URL(url).hash);
    expect(shared?.format).toBe('current');
    expect(shapeOf(shared?.doc as StructureDocument)).toEqual(shapeOf(document));
  });

  it('still reads a legacy hash and says so', () => {
    const shared = readSharedDocument(`#cfg=${encodeLegacyV1(sampleDocument())}`);
    expect(shared?.format).toBe('legacy');
    expect(countNodes(shared?.doc as StructureDocument)).toBe(countNodes(sampleDocument()));
  });

  it('prefers the current parameter when both are present', () => {
    const document = sampleDocument();
    const legacy = decodeLegacyShareLink(encodeLegacyV1(document)) as StructureDocument;
    const hash = `#d=${encodeDocument(document)}&cfg=${encodeLegacyV1(legacy)}`;
    expect(readSharedDocument(hash)?.format).toBe('current');
  });

  it('returns null for an empty or unrelated hash', () => {
    expect(readSharedDocument('')).toBeNull();
    expect(readSharedDocument('#')).toBeNull();
    expect(readSharedDocument('#section-two')).toBeNull();
    expect(readSharedDocument('#d=broken')).toBeNull();
  });
});
