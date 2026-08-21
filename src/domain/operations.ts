/**
 * Every mutation of the document lives here as a pure function so the store,
 * the keyboard shortcuts and the tests all go through the same rules.
 */

import {
  ancestorsOf,
  canAddChildOfKind,
  collectSubtreeIds,
  countChildrenOfKind,
  createNode,
  defaultChildKind,
  findNode,
  indexDocument,
  isDescendantOf,
  mapAllNodes,
  mapNode,
  removeSubtree,
  type AccountNode,
  type NodeId,
  type StructureDocument,
} from './document';
import { canLink, linkLimit, linkOwnerId, specOf, type NodeKind, type TerminalKind } from './kinds';
import { isPaymentMethodId } from './paymentMethods';
import {
  MAX_SETTINGS_PER_NODE,
  MAX_SETTING_VALUE_LENGTH,
  findSetting,
  settingKey,
} from './settings';

export const MAX_NAME_LENGTH = 64;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_VERSION_LENGTH = 24;
export const MAX_INTEGRATION_ID_LENGTH = 40;
export const MAX_DOMAIN_LENGTH = 63;

export interface AddChildResult {
  readonly doc: StructureDocument;
  /** Null when the parent cannot take another child of that kind. */
  readonly createdId: NodeId | null;
}

export function addChild(doc: StructureDocument, parentId: NodeId, kind?: NodeKind): AddChildResult {
  const parent = findNode(doc, parentId);
  if (!parent) return { doc, createdId: null };

  const targetKind = kind ?? defaultChildKind(parent);
  if (!targetKind || !canAddChildOfKind(parent, targetKind)) return { doc, createdId: null };

  const child = createNode(targetKind);
  const next = mapNode(doc, parentId, (node) => ({ ...node, children: [...node.children, child] }));
  return { doc: next, createdId: child.id };
}

export function removeNode(doc: StructureDocument, id: NodeId): StructureDocument {
  const node = findNode(doc, id);
  if (!node || doc.root.id === id) return doc;
  const removedIds = collectSubtreeIds(node);
  return pruneLinksTo(removeSubtree(doc, id), removedIds);
}

export function renameNode(doc: StructureDocument, id: NodeId, name: string): StructureDocument {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return mapNode(doc, id, (node) => {
    const next = clean === '' ? specOf(node.kind).defaultName : clean;
    return next === node.name ? node : { ...node, name: next };
  });
}

export function setNote(doc: StructureDocument, id: NodeId, note: string): StructureDocument {
  const clean = note.slice(0, MAX_NOTE_LENGTH);
  return mapNode(doc, id, (node) => (node.note === clean ? node : { ...node, note: clean }));
}

export interface KindChangeImpact {
  /** Direct children that the new kind cannot hold. */
  readonly droppedChildren: number;
  /** Nodes removed in total, including deeper descendants. */
  readonly droppedDescendants: number;
  /** Cross-links removed because the new kind cannot hold them. */
  readonly droppedLinks: number;
}

export function kindChangeImpact(
  doc: StructureDocument,
  id: NodeId,
  nextKind: NodeKind,
): KindChangeImpact {
  const node = findNode(doc, id);
  if (!node || node.kind === nextKind) {
    return { droppedChildren: 0, droppedDescendants: 0, droppedLinks: 0 };
  }

  const spec = specOf(nextKind);
  const kept = new Map<NodeKind, number>();
  let droppedChildren = 0;
  let droppedDescendants = 0;

  for (const child of node.children) {
    const limit = spec.childLimits[child.kind];
    const used = kept.get(child.kind) ?? 0;
    const allowed = spec.childKinds.includes(child.kind) && (limit === undefined || used < limit);
    if (allowed) {
      kept.set(child.kind, used + 1);
    } else {
      droppedChildren += 1;
      droppedDescendants += collectSubtreeIds(child).size;
    }
  }

  const keepsOwnLinks = node.links.filter((targetId) => {
    const target = findNode(doc, targetId);
    return target !== null && canLink(nextKind, target.kind);
  }).length;
  const droppedOwnLinks = node.links.length - keepsOwnLinks;

  let droppedIncomingLinks = 0;
  const index = indexDocument(doc);
  for (const [, location] of index) {
    if (location.node.id === id) continue;
    for (const targetId of location.node.links) {
      if (targetId === id && !canLink(location.node.kind, nextKind)) droppedIncomingLinks += 1;
    }
  }

  return { droppedChildren, droppedDescendants, droppedLinks: droppedOwnLinks + droppedIncomingLinks };
}

/**
 * Changes a node's kind and removes whatever the new kind cannot hold. Callers
 * that want to warn first should consult `kindChangeImpact`.
 */
export function setKind(doc: StructureDocument, id: NodeId, nextKind: NodeKind): StructureDocument {
  const node = findNode(doc, id);
  if (!node || node.kind === nextKind || specOf(node.kind).isRoot) return doc;

  const spec = specOf(nextKind);
  const kept = new Map<NodeKind, number>();
  const children = node.children.filter((child) => {
    const limit = spec.childLimits[child.kind];
    const used = kept.get(child.kind) ?? 0;
    if (!spec.childKinds.includes(child.kind)) return false;
    if (limit !== undefined && used >= limit) return false;
    kept.set(child.kind, used + 1);
    return true;
  });

  const renamed = node.name === specOf(node.kind).defaultName ? spec.defaultName : node.name;
  const withKind = mapNode(doc, id, (current) => ({
    ...current,
    kind: nextKind,
    name: renamed,
    terminals: spec.supportsTerminals ? current.terminals : [],
    integrations: spec.supportsIntegrations ? current.integrations : [],
    methods: spec.supportsMethods ? current.methods : [],
    logoDomain: spec.supportsLogo ? current.logoDomain : '',
    children,
  }));

  return pruneInvalidLinks(withKind);
}

export function addTerminal(doc: StructureDocument, id: NodeId, terminal: TerminalKind): StructureDocument {
  return mapNode(doc, id, (node) =>
    specOf(node.kind).supportsTerminals ? { ...node, terminals: [...node.terminals, terminal] } : node,
  );
}

export function removeTerminalAt(doc: StructureDocument, id: NodeId, position: number): StructureDocument {
  return mapNode(doc, id, (node) => {
    if (position < 0 || position >= node.terminals.length) return node;
    const terminals = node.terminals.filter((_, index) => index !== position);
    return { ...node, terminals };
  });
}

function cleanSettingValue(value: string): string {
  // Newlines would break the single-line rows in the card and the SVG export.
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_SETTING_VALUE_LENGTH);
}

/**
 * Adds or replaces a setting. An empty key is ignored, so a half-filled row in
 * the editor never reaches the document.
 */
export function setSetting(
  doc: StructureDocument,
  id: NodeId,
  key: string,
  value: string,
): StructureDocument {
  const cleanKey = settingKey(key);
  if (cleanKey === '') return doc;
  const cleanValue = cleanSettingValue(value);

  return mapNode(doc, id, (node) => {
    const existing = findSetting(node.settings, cleanKey);
    if (existing) {
      if (existing.value === cleanValue) return node;
      return {
        ...node,
        settings: node.settings.map((setting) =>
          setting.key === cleanKey ? { key: cleanKey, value: cleanValue } : setting,
        ),
      };
    }
    if (node.settings.length >= MAX_SETTINGS_PER_NODE) return node;
    return { ...node, settings: [...node.settings, { key: cleanKey, value: cleanValue }] };
  });
}

/** Renames a key in place, keeping its position in the list. */
export function renameSetting(
  doc: StructureDocument,
  id: NodeId,
  from: string,
  to: string,
): StructureDocument {
  const previous = settingKey(from);
  const next = settingKey(to);
  if (previous === next) return doc;

  return mapNode(doc, id, (node) => {
    if (!findSetting(node.settings, previous)) return node;
    // An empty new key removes the row; a colliding one would create a duplicate.
    if (next === '') return { ...node, settings: node.settings.filter((setting) => setting.key !== previous) };
    if (findSetting(node.settings, next)) return node;
    return {
      ...node,
      settings: node.settings.map((setting) =>
        setting.key === previous ? { key: next, value: setting.value } : setting,
      ),
    };
  });
}

export function removeSetting(doc: StructureDocument, id: NodeId, key: string): StructureDocument {
  const wanted = settingKey(key);
  return mapNode(doc, id, (node) => {
    if (!findSetting(node.settings, wanted)) return node;
    return { ...node, settings: node.settings.filter((setting) => setting.key !== wanted) };
  });
}

export function addIntegration(
  doc: StructureDocument,
  id: NodeId,
  integrationId: string,
  version = '',
): StructureDocument {
  const cleanId = integrationId.trim().slice(0, MAX_INTEGRATION_ID_LENGTH);
  if (cleanId === '') return doc;
  const cleanVersion = version.trim().slice(0, MAX_VERSION_LENGTH);

  return mapNode(doc, id, (node) => {
    if (!specOf(node.kind).supportsIntegrations) return node;
    if (node.integrations.some((entry) => entry.id === cleanId && entry.version === cleanVersion)) return node;
    return { ...node, integrations: [...node.integrations, { id: cleanId, version: cleanVersion }] };
  });
}

export function setIntegrationVersion(
  doc: StructureDocument,
  id: NodeId,
  position: number,
  version: string,
): StructureDocument {
  const cleanVersion = version.trim().slice(0, MAX_VERSION_LENGTH);
  return mapNode(doc, id, (node) => {
    const current = node.integrations[position];
    if (!current || current.version === cleanVersion) return node;
    return {
      ...node,
      integrations: node.integrations.map((entry, index) =>
        index === position ? { ...entry, version: cleanVersion } : entry,
      ),
    };
  });
}

export function removeIntegrationAt(doc: StructureDocument, id: NodeId, position: number): StructureDocument {
  return mapNode(doc, id, (node) => {
    if (position < 0 || position >= node.integrations.length) return node;
    return { ...node, integrations: node.integrations.filter((_, index) => index !== position) };
  });
}

export function toggleMethod(doc: StructureDocument, id: NodeId, method: string): StructureDocument {
  if (!isPaymentMethodId(method)) return doc;
  return mapNode(doc, id, (node) => {
    if (!specOf(node.kind).supportsMethods) return node;
    const has = node.methods.includes(method);
    return {
      ...node,
      methods: has ? node.methods.filter((entry) => entry !== method) : [...node.methods, method],
    };
  });
}

export function setMethods(doc: StructureDocument, id: NodeId, methods: readonly string[]): StructureDocument {
  const clean = methods.filter(isPaymentMethodId);
  return mapNode(doc, id, (node) => (specOf(node.kind).supportsMethods ? { ...node, methods: clean } : node));
}

/**
 * Stores a bare domain. Anything URL-shaped is reduced to its host so a pasted
 * address works, and the value stays short enough to keep share links small.
 */
export function setLogoDomain(doc: StructureDocument, id: NodeId, input: string): StructureDocument {
  const domain = normalizeDomain(input);
  return mapNode(doc, id, (node) => {
    if (!specOf(node.kind).supportsLogo || node.logoDomain === domain) return node;
    return { ...node, logoDomain: domain };
  });
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return '';
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const host = withoutScheme.split(/[/?#]/)[0] ?? '';
  const bare = host.replace(/^www\./, '');
  // A domain needs at least one dot and only host-safe characters.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare)) return '';
  return bare.slice(0, MAX_DOMAIN_LENGTH);
}

export function areLinked(doc: StructureDocument, a: NodeId, b: NodeId): boolean {
  const nodeA = findNode(doc, a);
  const nodeB = findNode(doc, b);
  if (!nodeA || !nodeB) return false;
  return nodeA.links.includes(b) || nodeB.links.includes(a);
}

/**
 * True when the owner side has room for another link of that kind. Merchant
 * account to balance platform is capped at one, so a second platform has to
 * replace the first rather than sit beside it.
 */
function withinLinkLimit(doc: StructureDocument, ownerId: NodeId, targetKind: NodeKind): boolean {
  const owner = findNode(doc, ownerId);
  if (!owner) return false;
  const max = linkLimit(owner.kind, targetKind);
  if (max === null) return true;
  const used = owner.links.filter((linkedId) => findNode(doc, linkedId)?.kind === targetKind).length;
  return used < max;
}

export function canCreateLink(doc: StructureDocument, a: NodeId, b: NodeId): boolean {
  if (a === b) return false;
  const nodeA = findNode(doc, a);
  const nodeB = findNode(doc, b);
  if (!nodeA || !nodeB) return false;
  if (!canLink(nodeA.kind, nodeB.kind)) return false;
  if (areLinked(doc, a, b)) return false;

  const ownership = linkOwnerId(a, nodeA.kind, b, nodeB.kind);
  if (!ownership) return false;
  const targetKind = ownership.targetId === a ? nodeA.kind : nodeB.kind;
  return withinLinkLimit(doc, ownership.ownerId, targetKind);
}

/**
 * The link that a new one would replace, when the owner is already at its cap.
 * Lets the UI offer a move instead of silently refusing.
 */
export function linkAtLimit(doc: StructureDocument, a: NodeId, b: NodeId): NodeId | null {
  const nodeA = findNode(doc, a);
  const nodeB = findNode(doc, b);
  if (!nodeA || !nodeB || !canLink(nodeA.kind, nodeB.kind) || areLinked(doc, a, b)) return null;

  const ownership = linkOwnerId(a, nodeA.kind, b, nodeB.kind);
  if (!ownership) return null;
  const owner = findNode(doc, ownership.ownerId);
  const targetKind = ownership.targetId === a ? nodeA.kind : nodeB.kind;
  if (!owner || linkLimit(owner.kind, targetKind) === null) return null;
  if (withinLinkLimit(doc, ownership.ownerId, targetKind)) return null;
  return owner.links.find((linkedId) => findNode(doc, linkedId)?.kind === targetKind) ?? null;
}

/**
 * Adds a link, dropping the one it displaces when the owner is capped. This is
 * what a merchant account being dragged onto a second balance platform does.
 */
export function relinkAtLimit(doc: StructureDocument, a: NodeId, b: NodeId): StructureDocument {
  const displaced = linkAtLimit(doc, a, b);
  if (displaced === null) return addLink(doc, a, b);
  const nodeA = findNode(doc, a);
  const nodeB = findNode(doc, b);
  if (!nodeA || !nodeB) return doc;
  const ownership = linkOwnerId(a, nodeA.kind, b, nodeB.kind);
  if (!ownership) return doc;
  return addLink(removeLink(doc, ownership.ownerId, displaced), a, b);
}

export function addLink(doc: StructureDocument, a: NodeId, b: NodeId): StructureDocument {
  if (!canCreateLink(doc, a, b)) return doc;
  const nodeA = findNode(doc, a);
  const nodeB = findNode(doc, b);
  if (!nodeA || !nodeB) return doc;

  // Only one side stores the pair, otherwise a link could be drawn twice.
  const ownership = linkOwnerId(a, nodeA.kind, b, nodeB.kind);
  if (!ownership) return doc;
  return mapNode(doc, ownership.ownerId, (node) => ({ ...node, links: [...node.links, ownership.targetId] }));
}

export function removeLink(doc: StructureDocument, a: NodeId, b: NodeId): StructureDocument {
  return mapAllNodes(doc, (node) => {
    if (node.id !== a && node.id !== b) return node;
    const other = node.id === a ? b : a;
    if (!node.links.includes(other)) return node;
    return { ...node, links: node.links.filter((linkId) => linkId !== other) };
  });
}

export function toggleLink(doc: StructureDocument, a: NodeId, b: NodeId): StructureDocument {
  return areLinked(doc, a, b) ? removeLink(doc, a, b) : relinkAtLimit(doc, a, b);
}

export type DropPosition = 'before' | 'after' | 'inside';

export function canMoveNode(
  doc: StructureDocument,
  id: NodeId,
  targetId: NodeId,
  position: DropPosition,
): boolean {
  if (id === targetId) return false;
  const index = indexDocument(doc);
  const moving = index.get(id);
  const target = index.get(targetId);
  if (!moving || !target) return false;
  if (specOf(moving.node.kind).isRoot) return false;
  if (isDescendantOf(doc, targetId, id)) return false;

  const parent = position === 'inside' ? target.node : target.parent;
  if (!parent) return false;

  const spec = specOf(parent.kind);
  if (!spec.childKinds.includes(moving.node.kind)) return false;

  const limit = spec.childLimits[moving.node.kind];
  if (limit !== undefined) {
    const existing = countChildrenOfKind(parent, moving.node.kind);
    const alreadyThere = moving.parent?.id === parent.id;
    if (!alreadyThere && existing >= limit) return false;
  }
  return true;
}

/**
 * Moves a node next to or inside another node. Reordering within a parent and
 * reparenting are the same operation.
 */
export function moveNode(
  doc: StructureDocument,
  id: NodeId,
  targetId: NodeId,
  position: DropPosition,
): StructureDocument {
  if (!canMoveNode(doc, id, targetId, position)) return doc;
  const moving = findNode(doc, id);
  if (!moving) return doc;

  const detached = removeSubtree(doc, id);
  const index = indexDocument(detached);
  const target = index.get(targetId);
  if (!target) return doc;

  if (position === 'inside') {
    return mapNode(detached, targetId, (node) => ({ ...node, children: [...node.children, moving] }));
  }

  const parent = target.parent;
  if (!parent) return doc;
  return mapNode(detached, parent.id, (node) => {
    const at = node.children.findIndex((child) => child.id === targetId);
    if (at === -1) return { ...node, children: [...node.children, moving] };
    const insertAt = position === 'before' ? at : at + 1;
    const children = [...node.children];
    children.splice(insertAt, 0, moving);
    return { ...node, children };
  });
}

/** Removes any link that references an id in `removed`. */
function pruneLinksTo(doc: StructureDocument, removed: ReadonlySet<NodeId>): StructureDocument {
  return mapAllNodes(doc, (node) => {
    if (node.links.length === 0) return node;
    const links = node.links.filter((targetId) => !removed.has(targetId));
    return links.length === node.links.length ? node : { ...node, links };
  });
}

/** Removes links whose endpoints no longer exist or are no longer compatible. */
function pruneInvalidLinks(doc: StructureDocument): StructureDocument {
  const index = indexDocument(doc);
  return mapAllNodes(doc, (node) => {
    if (node.links.length === 0) return node;
    const links = node.links.filter((targetId) => {
      const target = index.get(targetId);
      return target !== undefined && targetId !== node.id && canLink(node.kind, target.node.kind);
    });
    return links.length === node.links.length ? node : { ...node, links };
  });
}

/** Nodes a link may be created to from `id`, for drag targeting and the inspector. */
export function linkCandidates(doc: StructureDocument, id: NodeId): AccountNode[] {
  const source = findNode(doc, id);
  if (!source) return [];
  const candidates: AccountNode[] = [];
  const index = indexDocument(doc);
  for (const [, location] of index) {
    if (canCreateLink(doc, id, location.node.id)) candidates.push(location.node);
  }
  return candidates;
}

/** Drop targets for a move, used to highlight the canvas while dragging. */
export function moveCandidates(doc: StructureDocument, id: NodeId): Set<NodeId> {
  const result = new Set<NodeId>();
  const index = indexDocument(doc);
  for (const [candidateId] of index) {
    if (canMoveNode(doc, id, candidateId, 'inside') || canMoveNode(doc, id, candidateId, 'after')) {
      result.add(candidateId);
    }
  }
  return result;
}

export function breadcrumbOf(doc: StructureDocument, id: NodeId): string[] {
  return ancestorsOf(doc, id).map((node) => node.name);
}
