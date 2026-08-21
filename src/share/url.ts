/** Reading and writing the document that a URL carries in its hash. */

import type { StructureDocument } from '../domain/document';
import { decodeDocument, encodeDocument } from './codec';
import { decodeLegacyShareLink } from './legacy';

const CURRENT_PARAM = 'd';
const LEGACY_PARAM = 'cfg';

export interface SharedDocument {
  readonly doc: StructureDocument;
  /** Which format the link used, so the UI can mention an upgrade. */
  readonly format: 'current' | 'legacy';
}

export function readSharedDocument(hash: string): SharedDocument | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;

  const params = new URLSearchParams(raw);
  const current = params.get(CURRENT_PARAM);
  if (current) {
    const doc = decodeDocument(current);
    if (doc) return { doc, format: 'current' };
  }

  const legacy = params.get(LEGACY_PARAM);
  if (legacy) {
    const doc = decodeLegacyShareLink(legacy);
    if (doc) return { doc, format: 'legacy' };
  }

  return null;
}

export function buildShareUrl(doc: StructureDocument, base: URL): string {
  const url = new URL(base.toString());
  url.hash = `${CURRENT_PARAM}=${encodeDocument(doc)}`;
  return url.toString();
}
