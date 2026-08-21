/**
 * The document model. An immutable tree of nodes plus the cross-links between
 * them, with no reference to the DOM anywhere.
 *
 * The previous version used the live DOM as its state, which is why undo had to
 * snapshot `innerHTML` and why a markup change invalidated saved diagrams.
 */

import { NODE_SPECS, type NodeKind, type TerminalKind, specOf } from './kinds';

export type NodeId = string;

/**
 * A free-form configuration entry: an ADP, a terminal setting, or anything else
 * worth recording. Both halves are free text because the authoritative list of
 * account properties lives in Adyen's codebase, not here.
 */
export interface Setting {
  readonly key: string;
  readonly value: string;
}

export interface NodeIntegration {
  /** Id from `INTEGRATIONS`, or free text for something not in the registry. */
  readonly id: string;
  readonly version: string;
}

export interface AccountNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  /** Plain text. Never HTML, never interpolated into markup. */
  readonly name: string;
  readonly note: string;
  readonly terminals: readonly TerminalKind[];
  /** Cross-links owned by this node, pointing at nodes elsewhere in the tree. */
  readonly links: readonly NodeId[];
  /** Configuration set at this level. Descendants inherit it. */
  readonly settings: readonly Setting[];
  readonly integrations: readonly NodeIntegration[];
  /** Adyen txvariants, as listed in `PAYMENT_METHODS`. */
  readonly methods: readonly string[];
  /** Bare domain (`acme.com`) used to look up a logo. Empty when unset. */
  readonly logoDomain: string;
  readonly children: readonly AccountNode[];
}

export interface StructureDocument {
  readonly root: AccountNode;
}

let idCounter = 0;

export function createId(): NodeId {
  idCounter += 1;
  return `n${idCounter.toString(36)}`;
}

/** Used by tests to make id sequences predictable. */
export function resetIdCounter(): void {
  idCounter = 0;
}

export function createNode(kind: NodeKind, overrides: Partial<Omit<AccountNode, 'id' | 'kind'>> = {}): AccountNode {
  return {
    id: createId(),
    kind,
    name: overrides.name ?? specOf(kind).defaultName,
    note: overrides.note ?? '',
    terminals: overrides.terminals ?? [],
    links: overrides.links ?? [],
    settings: overrides.settings ?? [],
    integrations: overrides.integrations ?? [],
    methods: overrides.methods ?? [],
    logoDomain: overrides.logoDomain ?? '',
    children: overrides.children ?? [],
  };
}

export function createDefaultDocument(): StructureDocument {
  return {
    root: createNode('company', {
      children: [createNode('pos', { children: [createNode('store')] })],
    }),
  };
}

export interface NodeLocation {
  readonly node: AccountNode;
  readonly parent: AccountNode | null;
  readonly depth: number;
  /** Index within the parent's children. -1 for the root. */
  readonly index: number;
}

export type DocumentIndex = ReadonlyMap<NodeId, NodeLocation>;

/**
 * Flattens the tree into an id lookup. Callers that need several lookups should
 * build this once rather than calling `findNode` repeatedly.
 */
export function indexDocument(doc: StructureDocument): DocumentIndex {
  const index = new Map<NodeId, NodeLocation>();
  const visit = (node: AccountNode, parent: AccountNode | null, depth: number, position: number): void => {
    index.set(node.id, { node, parent, depth, index: position });
    node.children.forEach((child, childIndex) => visit(child, node, depth + 1, childIndex));
  };
  visit(doc.root, null, 0, -1);
  return index;
}

export function findNode(doc: StructureDocument, id: NodeId): AccountNode | null {
  let found: AccountNode | null = null;
  forEachNode(doc, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

export function forEachNode(
  doc: StructureDocument,
  visitor: (node: AccountNode, parent: AccountNode | null, depth: number) => void,
): void {
  const visit = (node: AccountNode, parent: AccountNode | null, depth: number): void => {
    visitor(node, parent, depth);
    for (const child of node.children) visit(child, node, depth + 1);
  };
  visit(doc.root, null, 0);
}

export function collectSubtreeIds(node: AccountNode, into: Set<NodeId> = new Set()): Set<NodeId> {
  into.add(node.id);
  for (const child of node.children) collectSubtreeIds(child, into);
  return into;
}

export function countNodes(doc: StructureDocument): number {
  let total = 0;
  forEachNode(doc, () => {
    total += 1;
  });
  return total;
}

/**
 * Rewrites the subtree rooted at `id` with `transform`. Returns the same
 * document instance when nothing matched, so callers can detect no-ops.
 */
export function mapNode(
  doc: StructureDocument,
  id: NodeId,
  transform: (node: AccountNode) => AccountNode,
): StructureDocument {
  const visit = (node: AccountNode): AccountNode => {
    if (node.id === id) return transform(node);
    const children = node.children.map((child) => visit(child));
    return children.every((child, i) => child === node.children[i]) ? node : { ...node, children };
  };
  // A transform that changes nothing returns the same root, and therefore the
  // same document: no-op edits must not invalidate the layout or add history.
  const root = visit(doc.root);
  return root === doc.root ? doc : { root };
}

/** Applies `transform` to every node, bottom-up structural sharing preserved. */
export function mapAllNodes(
  doc: StructureDocument,
  transform: (node: AccountNode, parent: AccountNode | null) => AccountNode,
): StructureDocument {
  const visit = (node: AccountNode, parent: AccountNode | null): AccountNode => {
    const children = node.children.map((child) => visit(child, node));
    const withChildren = children.every((child, i) => child === node.children[i])
      ? node
      : { ...node, children };
    return transform(withChildren, parent);
  };
  const root = visit(doc.root, null);
  return root === doc.root ? doc : { root };
}

export function removeSubtree(doc: StructureDocument, id: NodeId): StructureDocument {
  if (doc.root.id === id) return doc;
  const visit = (node: AccountNode): AccountNode => {
    const kept = node.children.filter((child) => child.id !== id);
    const children = kept.map(visit);
    const unchanged = kept.length === node.children.length && children.every((child, i) => child === kept[i]);
    return unchanged ? node : { ...node, children };
  };
  const root = visit(doc.root);
  return root === doc.root ? doc : { root };
}

export function isDescendantOf(doc: StructureDocument, candidateId: NodeId, ancestorId: NodeId): boolean {
  const ancestor = findNode(doc, ancestorId);
  if (!ancestor) return false;
  return ancestor.id !== candidateId && collectSubtreeIds(ancestor).has(candidateId);
}

/** Ancestor chain from the root down to (and excluding) `id`. */
export function ancestorsOf(doc: StructureDocument, id: NodeId): AccountNode[] {
  const trail: AccountNode[] = [];
  const visit = (node: AccountNode, path: AccountNode[]): boolean => {
    if (node.id === id) {
      trail.push(...path);
      return true;
    }
    return node.children.some((child) => visit(child, [...path, node]));
  };
  visit(doc.root, []);
  return trail;
}

/**
 * True when the node sits inside a balance platform subtree, which drives the
 * platform tint on the card.
 */
export function isInsidePlatform(doc: StructureDocument, id: NodeId): boolean {
  return ancestorsOf(doc, id).some((node) => node.kind === 'bp');
}

/** Every link in the document as ordered pairs, owner first. */
export function collectLinks(doc: StructureDocument): { source: NodeId; target: NodeId }[] {
  const pairs: { source: NodeId; target: NodeId }[] = [];
  forEachNode(doc, (node) => {
    for (const target of node.links) pairs.push({ source: node.id, target });
  });
  return pairs;
}

/** Number of children of `kind` directly under `parent`. */
export function countChildrenOfKind(parent: AccountNode, kind: NodeKind): number {
  return parent.children.reduce((total, child) => total + (child.kind === kind ? 1 : 0), 0);
}

/**
 * The kind `+` should create: the first allowed child kind that has not hit its
 * limit. A balance platform therefore yields a liable account holder first and
 * standard account holders from then on.
 */
export function defaultChildKind(parent: AccountNode): NodeKind | null {
  const spec = NODE_SPECS[parent.kind];
  for (const kind of spec.childKinds) {
    const limit = spec.childLimits[kind];
    if (limit === undefined || countChildrenOfKind(parent, kind) < limit) return kind;
  }
  return null;
}

export function canAddChildOfKind(parent: AccountNode, kind: NodeKind): boolean {
  const spec = NODE_SPECS[parent.kind];
  if (!spec.childKinds.includes(kind)) return false;
  const limit = spec.childLimits[kind];
  return limit === undefined || countChildrenOfKind(parent, kind) < limit;
}

export function canAddAnyChild(parent: AccountNode): boolean {
  return defaultChildKind(parent) !== null;
}
