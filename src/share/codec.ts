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
 * Layout of a v2 payload:
 *
 *   [2, node, links?]
 *   node  = [kindCode, name?, children?, note?, terminalCounts?]   trailing
 *                                                                 defaults cut
 *   links = [sourceIndex, targetIndex, ...]
 */

import LZString from 'lz-string';
import type { AccountNode, NodeId, StructureDocument } from '../domain/document';
import { forEachNode } from '../domain/document';
import { normalizeDocument, type RawNode } from '../domain/normalize';
import { TERMINAL_KINDS, specOf, type NodeKind, type TerminalKind } from '../domain/kinds';

export const SHARE_FORMAT_VERSION = 2;

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

type EncodedNode = [number, ...unknown[]];

function encodeTerminalCounts(terminals: readonly TerminalKind[]): number[] {
  const counts = TERMINAL_KINDS.map(() => 0);
  for (const terminal of terminals) {
    const code = TERMINAL_CODES.get(terminal);
    if (code !== undefined) counts[code] = (counts[code] ?? 0) + 1;
  }
  while (counts.length > 0 && counts[counts.length - 1] === 0) counts.pop();
  return counts;
}

function encodeNode(node: AccountNode, indices: Map<NodeId, number>, counter: { next: number }): EncodedNode {
  indices.set(node.id, counter.next);
  counter.next += 1;

  const children = node.children.map((child) => encodeNode(child, indices, counter));
  const terminals = encodeTerminalCounts(node.terminals);

  const fields: unknown[] = [
    KIND_CODES[node.kind],
    node.name === specOf(node.kind).defaultName ? 0 : node.name,
    children.length > 0 ? children : 0,
    node.note === '' ? 0 : node.note,
    terminals.length > 0 ? terminals : 0,
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

  const terminals: TerminalKind[] = [];
  if (Array.isArray(rawTerminals)) {
    (rawTerminals as unknown[]).forEach((count, code) => {
      const terminal = TERMINAL_KINDS[code];
      if (!terminal || typeof count !== 'number') return;
      for (let i = 0; i < Math.min(count, 32); i += 1) terminals.push(terminal);
    });
  }

  const node: DecodedNode = {
    index,
    id: `i${index}`,
    kind,
    name: typeof rawName === 'string' ? rawName : undefined,
    note: typeof rawNote === 'string' ? rawNote : '',
    terminals,
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

/** Decodes a v2 payload. Returns null when the string is not a v2 payload. */
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
  if (payload[0] !== SHARE_FORMAT_VERSION) return null;

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
