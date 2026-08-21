/**
 * Application state. History is a stack of documents rather than a stack of
 * markup strings, so undo cannot resurrect stale DOM and a keystroke does not
 * cost a full serialisation of the tree.
 */

import { create } from 'zustand';
import type { NodeId, StructureDocument } from '../domain/document';
import { createDefaultDocument, findNode } from '../domain/document';
import { nextVariant, type NodeKind, type TerminalKind } from '../domain/kinds';
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
  setEditing: (id: NodeId | null) => void;
  setHovered: (id: NodeId | null) => void;
  setHoveredLink: (id: string | null) => void;
  setDrag: (drag: DragState | null) => void;
  setInspectorOpen: (open: boolean) => void;

  addChild: (parentId: NodeId, kind?: NodeKind) => NodeId | null;
  remove: (id: NodeId) => void;
  rename: (id: NodeId, name: string) => void;
  setNote: (id: NodeId, note: string) => void;
  setKind: (id: NodeId, kind: NodeKind) => void;
  cycleKind: (id: NodeId) => void;
  addTerminal: (id: NodeId, terminal: TerminalKind) => void;
  removeTerminalAt: (id: NodeId, index: number) => void;
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

  select: (id) => set({ selectedId: id, inspectorOpen: id !== null, editingId: null }),
  setEditing: (id) => set({ editingId: id }),
  setHovered: (id) => set({ hoveredId: id }),
  setHoveredLink: (id) => set({ hoveredLinkId: id }),
  setDrag: (drag) => set({ drag }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),

  addChild: (parentId, kind) => {
    const { doc, commit } = get();
    const result = ops.addChild(doc, parentId, kind);
    if (result.createdId === null) return null;
    commit(result.doc);
    set({ selectedId: result.createdId, inspectorOpen: true });
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

  cycleKind: (id) => {
    const { doc } = get();
    const node = findNode(doc, id);
    if (!node) return;
    const next = nextVariant(node.kind);
    if (next) get().setKind(id, next);
  },

  addTerminal: (id, terminal) => get().commit(ops.addTerminal(get().doc, id, terminal)),
  removeTerminalAt: (id, index) => get().commit(ops.removeTerminalAt(get().doc, id, index)),
  toggleLink: (a, b) => get().commit(ops.toggleLink(get().doc, a, b)),
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

/** Debounced write-through to localStorage. */
export function startPersistence(): () => void {
  let timer: number | undefined;
  let lastSaved = useStore.getState().doc;

  const unsubscribe = useStore.subscribe((state) => {
    if (state.doc === lastSaved) return;
    lastSaved = state.doc;
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => saveDocument(lastSaved), 250);
  });

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
  };
}

/** Announced once at startup, after the UI is mounted. */
export const startupNotice = start.notice;
