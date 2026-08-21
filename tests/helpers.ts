import { createNode, type AccountNode, type StructureDocument } from '../src/domain/document';
import type { NodeKind } from '../src/domain/kinds';

/** Terse tree builder: `node('bp', node('accHolder'))`. */
export function node(
  kind: NodeKind,
  ...children: AccountNode[]
): AccountNode {
  return createNode(kind, { children });
}

export function named(kind: NodeKind, name: string, ...children: AccountNode[]): AccountNode {
  return createNode(kind, { name, children });
}

export function doc(root: AccountNode): StructureDocument {
  return { root };
}

/** Node ids in pre-order, so tests can address nodes without hard-coding ids. */
export function ids(document: StructureDocument): string[] {
  const collected: string[] = [];
  const visit = (current: AccountNode): void => {
    collected.push(current.id);
    current.children.forEach(visit);
  };
  visit(document.root);
  return collected;
}

/** Kinds in pre-order, the quickest way to assert a tree's shape. */
export function kinds(document: StructureDocument): NodeKind[] {
  const collected: NodeKind[] = [];
  const visit = (current: AccountNode): void => {
    collected.push(current.kind);
    current.children.forEach(visit);
  };
  visit(document.root);
  return collected;
}

export function byName(document: StructureDocument, name: string): AccountNode {
  let found: AccountNode | null = null;
  const visit = (current: AccountNode): void => {
    if (current.name === name) found = current;
    current.children.forEach(visit);
  };
  visit(document.root);
  if (!found) throw new Error(`No node named ${name}`);
  return found;
}
