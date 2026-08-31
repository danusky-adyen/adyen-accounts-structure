/**
 * Application state. History is a stack of documents rather than a stack of
 * markup strings, so undo cannot resurrect stale DOM and a keystroke does not
 * cost a full serialisation of the tree.
 */

import { create } from 'zustand';
import type { NodeId, StructureDocument } from '../domain/document';
import { createDefaultDocument, findNode } from '../domain/document';
import { nextVariant, prevVariant, type NodeKind, type TerminalKind } from '../domain/kinds';
import * as ops from '../domain/operations';
import type { ThemeName } from '../design/palette';
import { clearStoredDocument, loadStoredDocument, loadTheme, saveDocument, saveTheme } from './persistence';
import { readSharedDocument } from '../share/url';

const HISTORY_LIMIT = 120;
/** Edits tagged the same and made within this window become one history entry. */
const COALESCE_WINDOW_MS = 700;

export interface Viewport {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export type DropAction = 'link' | 'inside' | 'before' | 'after';

export interface DropTarget {
  readonly nodeId: NodeId;
  readonly action: DropAction;
}

export interface DragState {
  readonly nodeId: NodeId;
  /** Pointer position in canvas coordinates. */
  readonly pointer: { readonly x: number; readonly y: number };
  readonly target: DropTarget | null;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: 'info' | 'success' | 'error';
}

interface AppState {
  doc: StructureDocument;
  past: StructureDocument[];
  future: StructureDocument[];
  historyTag: string | null;
  historyAt: number;

  selectedId: NodeId | null;
  editingId: NodeId | null;
  /** Text the name editor opens with, when typing started the edit. */
  editingSeed: string | null;
  hoveredId: NodeId | null;
  hoveredLinkId: string | null;
  drag: DragState | null;

  viewport: Viewport;
  theme: ThemeName;
  toast: Toast | null;
  inspectorOpen: boolean;

  commit: (next: StructureDocument, tag?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  select: (id: NodeId | null) => void;
  setEditing: (id: NodeId | null, seed?: string) => void;
  setHovered: (id: NodeId | null) => void;
  setHoveredLink: (id: string | null) => void;
  setDrag: (drag: DragState | null) => void;
  setInspectorOpen: (open: boolean) => void;

  addChild: (parentId: NodeId, kind?: NodeKind) => NodeId | null;
  remove: (id: NodeId) => void;
  rename: (id: NodeId, name: string) => void;
  setNote: (id: NodeId, note: string) => void;
  setKind: (id: NodeId, kind: NodeKind) => void;
  cycleKind: (id: NodeId, direction?: 'next' | 'prev') => void;
  addTerminal: (id: NodeId, terminal: TerminalKind) => void;
  removeTerminalAt: (id: NodeId, index: number) => void;
  setSetting: (id: NodeId, key: string, value: string) => void;
  renameSetting: (id: NodeId, from: string, to: string) => void;
  removeSetting: (id: NodeId, key: string) => void;
  addIntegration: (id: NodeId, integrationId: string, version?: string) => void;
  setIntegrationVersion: (id: NodeId, position: number, version: string) => void;
  removeIntegrationAt: (id: NodeId, position: number) => void;
  toggleMethod: (id: NodeId, method: string) => void;
  setLogoDomain: (id: NodeId, domain: string) => void;
  toggleLink: (a: NodeId, b: NodeId) => void;
  move: (id: NodeId, targetId: NodeId, position: ops.DropPosition) => void;

  replaceDocument: (doc: StructureDocument) => void;
  reset: () => void;

  setViewport: (viewport: Viewport) => void;
  setTheme: (theme: ThemeName) => void;
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

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
let toastCounter = 0;

export const useStore = create<AppState>((set, get) => ({
  doc: start.doc,
  past: [],
  future: [],
  historyTag: null,
  historyAt: 0,

  selectedId: null,
  editingId: null,
  editingSeed: null,
  hoveredId: null,
  hoveredLinkId: null,
  drag: null,

  viewport: { scale: 1, x: 0, y: 0 },
  theme: loadTheme() ?? 'light',
  toast: null,
  inspectorOpen: false,

  commit: (next, tag) => {
    const { doc, past, historyTag, historyAt } = get();
    if (next === doc) return;
    const now = Date.now();
    const coalesce = tag !== undefined && tag === historyTag && now - historyAt < COALESCE_WINDOW_MS;
    set({
      doc: next,
      past: coalesce ? past : [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      historyTag: tag ?? null,
      historyAt: now,
    });
  },

  undo: () => {
    const { past, future, doc, selectedId } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({
      doc: previous,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_LIMIT),
      historyTag: null,
      selectedId: selectedId && findNode(previous, selectedId) ? selectedId : null,
      editingId: null,
    });
  },

  redo: () => {
    const { past, future, doc, selectedId } = get();
    const next = future[0];
    if (!next) return;
    set({
      doc: next,
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      historyTag: null,
      selectedId: selectedId && findNode(next, selectedId) ? selectedId : null,
      editingId: null,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  select: (id) => set({ selectedId: id, inspectorOpen: id !== null, editingId: null, editingSeed: null }),
  setEditing: (id, seed) => set({ editingId: id, editingSeed: seed ?? null }),
  setHovered: (id) => set({ hoveredId: id }),
  setHoveredLink: (id) => set({ hoveredLinkId: id }),
  setDrag: (drag) => set({ drag }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),

  /**
   * Adds a child and leaves the selection where it is. Whether adding should
   * move the user is a UI decision, so the caller makes it: clicking `+` or an
   * *Add below* button jumps to what it created, while ⇧↓ stays put so a run of
   * presses adds siblings instead of walking down the tree.
   */
  addChild: (parentId, kind) => {
    const { doc, commit } = get();
    const result = ops.addChild(doc, parentId, kind);
    if (result.createdId === null) return null;
    commit(result.doc);
    return result.createdId;
  },

  remove: (id) => {
    const { doc, commit, selectedId } = get();
    const next = ops.removeNode(doc, id);
    if (next === doc) return;
    commit(next);
    if (selectedId !== null && !findNode(next, selectedId)) {
      set({ selectedId: null, inspectorOpen: false });
    }
  },

  rename: (id, name) => get().commit(ops.renameNode(get().doc, id, name), `rename:${id}`),
  setNote: (id, note) => get().commit(ops.setNote(get().doc, id, note), `note:${id}`),
  setKind: (id, kind) => get().commit(ops.setKind(get().doc, id, kind)),

  cycleKind: (id, direction = 'next') => {
    const { doc } = get();
    const node = findNode(doc, id);
    if (!node) return;
    const target = direction === 'next' ? nextVariant(node.kind) : prevVariant(node.kind);
    if (target) get().setKind(id, target);
  },

  addTerminal: (id, terminal) => get().commit(ops.addTerminal(get().doc, id, terminal)),
  removeTerminalAt: (id, index) => get().commit(ops.removeTerminalAt(get().doc, id, index)),

  // Settings and versions are typed character by character, so they coalesce
  // per key rather than filling the history with single letters.
  setSetting: (id, key, value) => get().commit(ops.setSetting(get().doc, id, key, value), `setting:${id}:${key}`),
  renameSetting: (id, from, to) => get().commit(ops.renameSetting(get().doc, id, from, to), `settingKey:${id}:${from}`),
  removeSetting: (id, key) => get().commit(ops.removeSetting(get().doc, id, key)),

  addIntegration: (id, integrationId, version) =>
    get().commit(ops.addIntegration(get().doc, id, integrationId, version)),
  setIntegrationVersion: (id, position, version) =>
    get().commit(ops.setIntegrationVersion(get().doc, id, position, version), `version:${id}:${position}`),
  removeIntegrationAt: (id, position) => get().commit(ops.removeIntegrationAt(get().doc, id, position)),
  toggleMethod: (id, method) => get().commit(ops.toggleMethod(get().doc, id, method)),
  setLogoDomain: (id, domain) => get().commit(ops.setLogoDomain(get().doc, id, domain), `logo:${id}`),

  toggleLink: (a, b) => {
    const { doc, notify } = get();
    // A merchant account can only sit on one balance platform, so linking it to
    // a second one moves it instead of failing silently.
    const displaced = ops.linkAtLimit(doc, a, b);
    get().commit(ops.toggleLink(doc, a, b));
    if (displaced !== null) {
      notify(`Moved to this balance platform, replacing ${findNode(doc, displaced)?.name ?? 'the previous one'}`);
    }
  },
  move: (id, targetId, position) => get().commit(ops.moveNode(get().doc, id, targetId, position)),

  replaceDocument: (doc) => {
    const current = get().doc;
    set({
      doc,
      past: [...get().past, current].slice(-HISTORY_LIMIT),
      future: [],
      selectedId: null,
      editingId: null,
      inspectorOpen: false,
      historyTag: null,
    });
  },

  reset: () => {
    clearStoredDocument();
    get().replaceDocument(createDefaultDocument());
  },

  setViewport: (viewport) => set({ viewport }),

  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },

  notify: (message, tone = 'info') => {
    toastCounter += 1;
    const id = toastCounter;
    set({ toast: { id, message, tone } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },

  dismissToast: (id) => {
    if (get().toast?.id === id) set({ toast: null });
  },
}));

/**
 * Write-through to localStorage, so what is on screen is what comes back on the
 * next visit, whether that is in a minute or next week.
 *
 * Writes are debounced because a rename fires per keystroke, and flushed when
 * the page is hidden or closed: without that, the last edit before a reload or
 * a closed tab is the one that gets lost. The document present at startup is
 * written straight away, so a diagram opened from a share link is what a reload
 * shows rather than whatever was stored before it.
 */
export function startPersistence(): () => void {
  let timer: number | undefined;
  let pending: StructureDocument | null = null;
  let lastSaved: StructureDocument | null = null;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending === null) return;
    saveDocument(pending);
    lastSaved = pending;
    pending = null;
  };

  pending = useStore.getState().doc;
  flush();

  const unsubscribe = useStore.subscribe((state) => {
    if (state.doc === lastSaved) return;
    pending = state.doc;
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(flush, 250);
  });

  // `pagehide` covers navigation and tab close, including iOS Safari where
  // `beforeunload` never fires; `visibilitychange` covers a tab left in the
  // background and killed later.
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    flush();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
  };
}

/** Announced once at startup, after the UI is mounted. */
export const startupNotice = start.notice;
