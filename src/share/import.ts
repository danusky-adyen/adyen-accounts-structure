/**
 * Turning pasted text into a document. Accepts the three things a person is
 * likely to have on their clipboard: the JSON a model produced, a share link
 * from this tool, or the bare payload out of such a link.
 */

import { normalizeDocument } from '../domain/normalize';
import type { StructureDocument } from '../domain/document';
import { decodeDocument } from './codec';
import { decodeLegacyShareLink } from './legacy';
import { readSharedDocument } from './url';

export type ImportSource = 'json' | 'link';

export interface ImportResult {
  readonly doc: StructureDocument;
  readonly source: ImportSource;
  /** Nodes in the result, so the UI can say what arrived. */
  readonly nodeCount: number;
}

export type ImportOutcome = ImportResult | { readonly error: string };

function countNodes(doc: StructureDocument): number {
  const visit = (node: StructureDocument['root']): number =>
    1 + node.children.reduce((total, child) => total + visit(child), 0);
  return visit(doc.root);
}

/** Extracts the JSON object out of text that may be wrapped in a code fence. */
function findJsonObject(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

export function importFromText(text: string): ImportOutcome {
  const trimmed = text.trim();
  if (trimmed === '') return { error: 'Nothing to import yet.' };

  // A link first: its payload can itself contain braces, so JSON detection
  // would otherwise mangle it.
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex !== -1) {
    const shared = readSharedDocument(trimmed.slice(hashIndex));
    if (shared) return { doc: shared.doc, source: 'link', nodeCount: countNodes(shared.doc) };
  }

  if (!trimmed.includes('{')) {
    const fromPayload = decodeDocument(trimmed) ?? decodeLegacyShareLink(trimmed);
    if (fromPayload) return { doc: fromPayload, source: 'link', nodeCount: countNodes(fromPayload) };
    return { error: 'That does not look like a diagram link or JSON.' };
  }

  const json = findJsonObject(trimmed);
  if (json === null) return { error: 'No JSON object found in that text.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'That JSON could not be parsed. Check for a missing comma or bracket.' };
  }

  const doc = normalizeDocument(parsed);
  const nodeCount = countNodes(doc);
  // A single node means everything was rejected: the shape was wrong rather
  // than the diagram genuinely being one card.
  if (nodeCount === 1 && !hasChildren(parsed)) {
    return { error: 'The JSON parsed but held no accounts. Does the root have a "children" array?' };
  }

  return { doc, source: 'json', nodeCount };
}

function hasChildren(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { root?: unknown; children?: unknown };
  const root = typeof record.root === 'object' && record.root !== null ? record.root : record;
  const children = (root as { children?: unknown }).children;
  return Array.isArray(children) && children.length > 0;
}
