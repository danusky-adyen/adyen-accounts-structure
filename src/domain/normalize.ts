/**
 * Everything entering the app from outside (a share link, localStorage, a
 * legacy diagram) goes through `normalizeDocument`, which is the only place
 * allowed to trust untrusted input. It guarantees the invariants the renderer
 * and layout engine rely on:
 *
 *  - the root is a company node
 *  - every child kind is allowed under its parent, within the parent's limits
 *  - terminals only exist on kinds that support them
 *  - links point at existing, compatible nodes and are stored once per pair
 *  - ids are unique
 *  - names and notes are plain strings of bounded length
 */

import {
  createId,
  createNode,
  type AccountNode,
  type NodeId,
  type StructureDocument,
} from './document';
import {
  canLink,
  isNodeKind,
  isTerminalKind,
  linkKey,
  linkOwnerId,
  specOf,
  type NodeKind,
  type TerminalKind,
} from './kinds';
import { MAX_NAME_LENGTH, MAX_NOTE_LENGTH } from './operations';

/** Shape of a node before validation: anything at all. */
export interface RawNode {
  kind?: unknown;
  name?: unknown;
  note?: unknown;
  terminals?: unknown;
  links?: unknown;
  children?: unknown;
  id?: unknown;
}

function asText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // Strip control characters: they serve no purpose in a label and can break
  // both the SVG export and the clipboard payload.
  // eslint-disable-next-line no-control-regex -- the point of this line
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength);
}

function asName(value: unknown, kind: NodeKind): string {
  const text = asText(value, MAX_NAME_LENGTH).replace(/\s+/g, ' ').trim();
  return text === '' ? specOf(kind).defaultName : text;
}

function asTerminals(value: unknown, kind: NodeKind): TerminalKind[] {
  if (!specOf(kind).supportsTerminals || !Array.isArray(value)) return [];
  return value.filter(isTerminalKind).slice(0, 32);
}

function asLinkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Builds a valid tree from arbitrary input. Children whose kind is not allowed
 * under the parent are dropped along with their subtree, which is how diagrams
 * from the previous version shed the nodes it kept but hid.
 */
function buildNode(raw: RawNode, kind: NodeKind, idMap: Map<string, NodeId>): AccountNode {
  const spec = specOf(kind);
  const id = createId();
  if (typeof raw.id === 'string' && raw.id !== '') idMap.set(raw.id, id);

  const rawChildren: unknown[] = Array.isArray(raw.children) ? (raw.children as unknown[]) : [];
  const used = new Map<NodeKind, number>();
  const children: AccountNode[] = [];

  for (const rawChild of rawChildren) {
    if (typeof rawChild !== 'object' || rawChild === null) continue;
    const child = rawChild as RawNode;
    const childKind = normalizeKind(child.kind);
    if (childKind === null || !spec.childKinds.includes(childKind)) continue;
    const limit = spec.childLimits[childKind];
    const count = used.get(childKind) ?? 0;
    if (limit !== undefined && count >= limit) continue;
    used.set(childKind, count + 1);
    children.push(buildNode(child, childKind, idMap));
  }

  return {
    id,
    kind,
    name: asName(raw.name, kind),
    note: asText(raw.note, MAX_NOTE_LENGTH),
    terminals: asTerminals(raw.terminals, kind),
    // Old ids are resolved in a second pass, once the whole map is known.
    links: asLinkIds(raw.links),
    children,
  };
}

/**
 * Accepts kinds that no longer exist as their own type. `liableBalanceAcc` used
 * to be a distinct kind kept in sync with its holder by hand; liability is now
 * derived from the parent, so it maps onto a plain balance account.
 */
const KIND_ALIASES: Record<string, NodeKind> = {
  liableBalanceAcc: 'balanceAcc',
  merchant: 'pos',
  accountHolder: 'accHolder',
  liableAccountHolder: 'liableAccHolder',
  transferInstrument: 'transferInst',
  paymentInstrument: 'payInstCard',
};

export function normalizeKind(value: unknown): NodeKind | null {
  if (isNodeKind(value)) return value;
  if (typeof value === 'string' && value in KIND_ALIASES) {
    return KIND_ALIASES[value] ?? null;
  }
  return null;
}

/**
 * Resolves raw link references in one pass: unknown or incompatible endpoints
 * are dropped, each surviving pair is deduplicated regardless of which side
 * declared it, and the result is stored on the owning node only.
 */
function applyLinks(root: AccountNode, idMap: Map<string, NodeId>): AccountNode {
  const kinds = new Map<NodeId, NodeKind>();
  const collectKinds = (node: AccountNode): void => {
    kinds.set(node.id, node.kind);
    node.children.forEach(collectKinds);
  };
  collectKinds(root);

  const owned = new Map<NodeId, NodeId[]>();
  const seen = new Set<string>();

  const collectLinks = (node: AccountNode): void => {
    for (const rawTarget of node.links) {
      const targetId = idMap.get(rawTarget) ?? (kinds.has(rawTarget) ? rawTarget : undefined);
      if (targetId === undefined || targetId === node.id) continue;
      const targetKind = kinds.get(targetId);
      if (targetKind === undefined || !canLink(node.kind, targetKind)) continue;

      const key = linkKey(node.id, targetId);
      if (seen.has(key)) continue;
      seen.add(key);

      const ownership = linkOwnerId(node.id, node.kind, targetId, targetKind);
      if (!ownership) continue;
      const list = owned.get(ownership.ownerId) ?? [];
      list.push(ownership.targetId);
      owned.set(ownership.ownerId, list);
    }
    node.children.forEach(collectLinks);
  };
  collectLinks(root);

  const visit = (node: AccountNode): AccountNode => ({
    ...node,
    links: owned.get(node.id) ?? [],
    children: node.children.map(visit),
  });
  return visit(root);
}

export function normalizeDocument(raw: unknown): StructureDocument {
  if (typeof raw !== 'object' || raw === null) return { root: createNode('company') };

  const candidate = raw as { root?: unknown } & RawNode;
  const rawRoot = (typeof candidate.root === 'object' && candidate.root !== null ? candidate.root : candidate) as RawNode;

  const idMap = new Map<string, NodeId>();
  const built = buildNode(rawRoot, 'company', idMap);
  return { root: applyLinks(built, idMap) };
}
