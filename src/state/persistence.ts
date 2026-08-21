/**
 * localStorage access. The previous version stored the tree's `innerHTML` under
 * `adyen_v70`, so any markup change invalidated it; the document is now stored
 * as JSON and the old entry is imported once and left untouched as a backup.
 */

import type { StructureDocument } from '../domain/document';
import { normalizeDocument } from '../domain/normalize';
import { LEGACY_STORAGE_KEY, importLegacyMarkup } from '../share/legacy';
import type { ThemeName } from '../design/palette';

const DOCUMENT_KEY = 'aas.document.v2';
const THEME_KEY = 'aas.theme';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private-mode Safari throws on access rather than returning null.
    return null;
  }
}

export interface LoadResult {
  readonly doc: StructureDocument;
  readonly source: 'stored' | 'legacy';
}

export function loadStoredDocument(): LoadResult | null {
  const store = storage();
  if (!store) return null;

  const stored = store.getItem(DOCUMENT_KEY);
  if (stored) {
    try {
      return { doc: normalizeDocument(JSON.parse(stored)), source: 'stored' };
    } catch {
      // Fall through to the legacy import rather than losing the diagram.
    }
  }

  const legacy = store.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    const doc = importLegacyMarkup(legacy);
    if (doc) return { doc, source: 'legacy' };
  }

  return null;
}

export function saveDocument(doc: StructureDocument): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(DOCUMENT_KEY, JSON.stringify(doc));
  } catch {
    // Quota exceeded: the diagram stays usable, it just will not persist.
  }
}

export function clearStoredDocument(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(DOCUMENT_KEY);
  } catch {
    /* ignore */
  }
}

export function loadTheme(): ThemeName | null {
  const value = storage()?.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function saveTheme(theme: ThemeName): void {
  try {
    storage()?.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}
