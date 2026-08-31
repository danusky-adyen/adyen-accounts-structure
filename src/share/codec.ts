/**
 * Share-link codec.
 *
 * v1 (the `#cfg=` links the previous version produced) serialised every node as
 * an object with a random 9-character id, and repeated those ids inside every
 * cross-link. v2 drops the ids entirely: nodes are written in pre-order and
 * links refer to a node's position, so a link costs two small integers instead
 * of two 14-character strings. Fields that hold their default (an unchanged
 * name, an empty note, no terminals) are omitted altogether. A 16-node sample
 * structure goes from 880 to 358 characters, the starting diagram from 176 to
 * 23; `tests/share.test.ts` keeps that gap from regressing.
 *
 * v3 appends the fields added later. Because they are appended and trailing
 * defaults are cut, a v2 payload is a valid v3 payload with the new fields
 * missing, so one decoder reads both.
 *
 * Layout of a v5 payload:
 *
 *   [5, node, links?]
 *   node  = [kindCode, name?, children?, note?, terminals?,
 *            settings?, integrations?, methods?, logoDomain?]  trailing
 *                                                             defaults cut
 *   links = [sourceIndex, targetIndex, ...]
 *
 * v4 replaces the integration and payment-method id strings with the frozen
 * codes below. An index into the registries themselves would be unusable: the
 * payment-method list is generated from a script and the integration list keeps
 * growing, so a reordering would silently rebind every old link. These tables
 * are written out by hand instead, never renumbered, and an id with no code
 * still travels as a string, so a link stays readable across registry edits.
 * The 13-node sample above goes from 880 to 683 characters.
 *
 * v5 writes terminals as `[code, count]` pairs. The dense array v2–v4 used was
 * indexed by code, which was fine for four terminal kinds and wasteful once
 * individual models pushed the highest code to 17.
 *
 * Settings keys and values stay as free text: they are whatever the user typed.
 */

import LZString from 'lz-string';
import type { AccountNode, NodeId, StructureDocument } from '../domain/document';
import { forEachNode } from '../domain/document';
import { normalizeDocument, type RawNode } from '../domain/normalize';
import { TERMINAL_KINDS, specOf, type NodeKind, type TerminalKind } from '../domain/kinds';

export const SHARE_FORMAT_VERSION = 5;

/** Payload versions this build can read. */
const READABLE_VERSIONS = new Set([2, 3, 4, SHARE_FORMAT_VERSION]);

/**
 * Frozen wire codes. Never renumber these: existing links depend on them. New
 * kinds append.
 */
const KIND_CODES = {
  company: 0,
  pos: 1,
  ecom: 2,
  bp: 3,
  store: 4,
  accHolder: 5,
  liableAccHolder: 6,
  legalEntity: 7,
  businessLine: 8,
  transferInst: 9,
  balanceAcc: 10,
  grantAcc: 11,
  payInstCard: 12,
  payInstBiz: 13,
  grantRef: 14,
} as const satisfies Record<NodeKind, number>;

const KIND_BY_CODE = new Map<number, NodeKind>(
  Object.entries(KIND_CODES).map(([kind, code]) => [code, kind as NodeKind]),
);

const TERMINAL_CODES = new Map<TerminalKind, number>(TERMINAL_KINDS.map((kind, index) => [kind, index]));

/**
 * Frozen wire codes for integration ids. Append new ids at the end; never
 * change or reuse a number. `tests/share.test.ts` fails when the registry gains
 * an id that has no code here.
 */
const INTEGRATION_CODES: Readonly<Record<string, number>> = {
  webDropin: 0,
  webComponents: 1,
  apiOnly: 2,
  payByLink: 3,
  hostedCheckout: 4,
  iosSdk: 5,
  androidSdk: 6,
  reactNative: 7,
  flutter: 8,
  terminalApiCloud: 9,
  terminalApiLocal: 10,
  posMobileSdk: 11,
  tapToPay: 12,
  standalone: 13,
  shopify: 14,
  adobeCommerce: 15,
  sapCommerce: 16,
  salesforce: 17,
  dynamics365: 18,
  oracle: 19,
  bigCommerce: 20,
  wooCommerce: 21,
  shopware: 22,
  lightspeed: 23,
  mirakl: 24,
  otherPartner: 25,
  platforms: 26,
  marketplace: 27,
  issuing: 28,
  capital: 29,
};

/** Frozen wire codes for payment-method ids. Same rules as above. */
const METHOD_CODES: Readonly<Record<string, number>> = {
  visa: 0,
  mc: 1,
  amex: 2,
  maestro: 3,
  discover: 4,
  jcb: 5,
  cup: 6,
  girocard: 7,
  bcmc: 8,
  applepay: 9,
  googlepay: 10,
  paypal: 11,
  cashapp: 12,
  alipay: 13,
  wechatpay: 14,
  ideal: 15,
  directEbanking: 16,
  eps: 17,
  trustly: 18,
  blik: 19,
  pix: 20,
  sepadirectdebit: 21,
  klarna: 22,
  afterpaytouch: 23,
  affirm: 24,
  twint: 25,
  swish: 26,
  mobilepay: 27,
  vipps: 28,
  mbway: 29,
};

export const WIRE_CODES = { integrations: INTEGRATION_CODES, methods: METHOD_CODES } as const;

function invert(codes: Readonly<Record<string, number>>): ReadonlyMap<number, string> {
  return new Map(Object.entries(codes).map(([id, code]) => [code, id]));
}

const INTEGRATION_BY_CODE = invert(INTEGRATION_CODES);
const METHOD_BY_CODE = invert(METHOD_CODES);

/** A known id shrinks to its code; anything else travels verbatim. */
function toWire(id: string, codes: Readonly<Record<string, number>>): string | number {
  return codes[id] ?? id;
}

function fromWire(value: unknown, byCode: ReadonlyMap<number, string>): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return null;
  return byCode.get(value) ?? null;
}

type EncodedNode = [number, ...unknown[]];

/**
 * `[[code, count], ...]`, one pair per terminal kind present. v4 wrote a dense
 * array indexed by code, which was compact while there were four kinds and
 * wasteful now that a model sits at code 17: a single S1U2 cost a run of zeros.
 */
function encodeTerminals(terminals: readonly TerminalKind[]): number[][] {
  const counts = new Map<number, number>();
  for (const terminal of terminals) {
    const code = TERMINAL_CODES.get(terminal);
    if (code !== undefined) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a - b).map(([code, count]) => [code, count]);
}

function encodeNode(node: AccountNode, indices: Map<NodeId, number>, counter: { next: number }): EncodedNode {
  indices.set(node.id, counter.next);
  counter.next += 1;

  const children = node.children.map((child) => encodeNode(child, indices, counter));
  const terminals = encodeTerminals(node.terminals);

  const settings = node.settings.map((setting) => [setting.key, setting.value]);
  // A version-less integration is written as a bare code, which is the common case.
  const integrations = node.integrations.map((entry) => {
    const id = toWire(entry.id, INTEGRATION_CODES);
    return entry.version === '' ? id : [id, entry.version];
  });
  const methods = node.methods.map((method) => toWire(method, METHOD_CODES));

  const fields: unknown[] = [
    KIND_CODES[node.kind],
    node.name === specOf(node.kind).defaultName ? 0 : node.name,
    children.length > 0 ? children : 0,
    node.note === '' ? 0 : node.note,
    terminals.length > 0 ? terminals : 0,
    settings.length > 0 ? settings : 0,
    integrations.length > 0 ? integrations : 0,
    methods.length > 0 ? methods : 0,
    node.logoDomain === '' ? 0 : node.logoDomain,
  ];

  while (fields.length > 1 && fields[fields.length - 1] === 0) fields.pop();
  return fields as EncodedNode;
}

export function encodeDocument(doc: StructureDocument): string {
  const indices = new Map<NodeId, number>();
  const root = encodeNode(doc.root, indices, { next: 0 });

  const links: number[] = [];
  forEachNode(doc, (node) => {
    const source = indices.get(node.id);
    if (source === undefined) return;
    for (const targetId of node.links) {
      const target = indices.get(targetId);
      if (target !== undefined) links.push(source, target);
    }
  });

  const payload: unknown[] = [SHARE_FORMAT_VERSION, root];
  if (links.length > 0) payload.push(links);
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

interface DecodedNode extends RawNode {
  /** Pre-order position, used to resolve links. */
  index: number;
}

/** `[[key, value], ...]` into the object form `normalizeDocument` validates. */
function decodeSettings(value: unknown): { key: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  const settings: { key: string; value: string }[] = [];
  for (const entry of value as unknown[]) {
    if (!Array.isArray(entry)) continue;
    const pair = entry as unknown[];
    if (typeof pair[0] !== 'string') continue;
    settings.push({ key: pair[0], value: typeof pair[1] === 'string' ? pair[1] : '' });
  }
  return settings;
}

/**
 * v5 pairs, `[[code, count], ...]`, or the dense v2–v4 array indexed by code.
 * The two are told apart by their elements, so old links keep their terminals.
 */
function decodeTerminals(value: unknown): TerminalKind[] {
  if (!Array.isArray(value)) return [];
  const terminals: TerminalKind[] = [];
  const push = (code: unknown, count: unknown): void => {
    if (typeof code !== 'number' || typeof count !== 'number') return;
    const terminal = TERMINAL_KINDS[code];
    if (!terminal) return;
    for (let i = 0; i < Math.min(count, 32); i += 1) terminals.push(terminal);
  };

  (value as unknown[]).forEach((entry, index) => {
    if (Array.isArray(entry)) push(entry[0], entry[1]);
    else push(index, entry);
  });
  return terminals;
}

/** A bare id or code, or `[id, version]`. */
function decodeIntegrations(value: unknown): { id: string; version: string }[] {
  if (!Array.isArray(value)) return [];
  const integrations: { id: string; version: string }[] = [];
  for (const entry of value as unknown[]) {
    if (!Array.isArray(entry)) {
      const id = fromWire(entry, INTEGRATION_BY_CODE);
      if (id !== null) integrations.push({ id, version: '' });
      continue;
    }
    const pair = entry as unknown[];
    const id = fromWire(pair[0], INTEGRATION_BY_CODE);
    if (id === null) continue;
    integrations.push({ id, version: typeof pair[1] === 'string' ? pair[1] : '' });
  }
  return integrations;
}

function decodeMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const methods: string[] = [];
  for (const entry of value as unknown[]) {
    const id = fromWire(entry, METHOD_BY_CODE);
    if (id !== null) methods.push(id);
  }
  return methods;
}

function decodeNode(value: unknown, counter: { next: number }, flat: DecodedNode[]): RawNode | null {
  if (!Array.isArray(value)) return null;
  // `Array.isArray` widens to `any[]`; keep every field at `unknown` so each
  // one has to be checked before use.
  const fields = value as unknown[];
  const rawKind = fields[0];
  const kind = KIND_BY_CODE.get(typeof rawKind === 'number' ? rawKind : -1);
  if (!kind) return null;

  const index = counter.next;
  counter.next += 1;

  const rawName = fields[1];
  const rawChildren = fields[2];
  const rawNote = fields[3];
  const rawTerminals = fields[4];

  const terminals = decodeTerminals(rawTerminals);

  const node: DecodedNode = {
    index,
    id: `i${index}`,
    kind,
    name: typeof rawName === 'string' ? rawName : undefined,
    note: typeof rawNote === 'string' ? rawNote : '',
    terminals,
    settings: decodeSettings(fields[5]),
    integrations: decodeIntegrations(fields[6]),
    methods: decodeMethods(fields[7]),
    logoDomain: typeof fields[8] === 'string' ? fields[8] : '',
    children: [],
  };
  flat.push(node);

  if (Array.isArray(rawChildren)) {
    const children: RawNode[] = [];
    for (const rawChild of rawChildren as unknown[]) {
      const child = decodeNode(rawChild, counter, flat);
      if (child) children.push(child);
    }
    node.children = children;
  }

  return node;
}

/** Decodes a v2 or v3 payload. Returns null when the string is neither. */
export function decodeDocument(encoded: string): StructureDocument | null {
  let parsed: unknown;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;
  const payload = parsed as unknown[];
  if (typeof payload[0] !== 'number' || !READABLE_VERSIONS.has(payload[0])) return null;

  const flat: DecodedNode[] = [];
  const root = decodeNode(payload[1], { next: 0 }, flat);
  if (!root) return null;

  const rawLinks = payload[2];
  if (Array.isArray(rawLinks)) {
    const linkFields = rawLinks as unknown[];
    for (let i = 0; i + 1 < linkFields.length; i += 2) {
      const sourceIndex = linkFields[i];
      const targetIndex = linkFields[i + 1];
      if (typeof sourceIndex !== 'number' || typeof targetIndex !== 'number') continue;
      const source = flat[sourceIndex];
      const target = flat[targetIndex];
      if (!source || !target) continue;
      const existing: string[] = Array.isArray(source.links) ? (source.links as string[]) : [];
      source.links = [...existing, `i${targetIndex}`];
    }
  }

  return normalizeDocument({ root });
}
