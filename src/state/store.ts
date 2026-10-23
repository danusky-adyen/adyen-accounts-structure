/**
 * Application state, composed from two slices: the diagram with its history
 * (`documentSlice`), and the session around it (`uiSlice`). Autosave lives in
 * `autosave.ts` and pan/zoom in `viewport.ts`, outside this store, because they
 * either observe it or change far too often to belong in it.
 */

import { create } from 'zustand';
import { createDefaultDocument, type StructureDocument } from '../domain/document';
import { watchSystemTheme } from '../design/theme';
import { readSharedDocument } from '../share/url';
import { createDocumentSlice, type DocumentSlice } from './documentSlice';
import { loadStoredDocument } from './persistence';
import { createUiSlice, type UiSlice } from './uiSlice';

export type {
  DragState,
  DropAction,
  DropTarget,
  PendingKind,
  SaveStatus,
  ThemePreference,
  Toast,
} from './uiSlice';

export type AppState = DocumentSlice & UiSlice;

function initialDocument(): { doc: StructureDocument; notice: string | null } {
  if (typeof window !== 'undefined') {
    const shared = readSharedDocument(window.location.hash);
    if (shared) {
      // The hash is cleared so a later reload shows the user's own work rather
      // than silently reverting to the shared snapshot.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return {
        doc: shared.doc,
        notice: shared.format === 'legacy' ? 'Opened a diagram from an older share link' : null,
      };
    }
  }

  const stored = loadStoredDocument();
  if (stored) {
    return {
      doc: stored.doc,
      notice: stored.source === 'legacy' ? 'Imported your diagram from the previous version' : null,
    };
  }

  return { doc: createDefaultDocument(), notice: null };
}

const start = initialDocument();

export const useStore = create<AppState>()((...args) => ({
  ...createDocumentSlice(start.doc)(...args),
  ...createUiSlice(...args),
}));

/** Announced once at startup, after the UI is mounted. */
export const startupNotice = start.notice;

/** Keeps a `system` theme in step with the operating system. */
export function followSystemTheme(): () => void {
  return watchSystemTheme((theme) => useStore.getState().setSystemTheme(theme));
}
