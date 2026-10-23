/**
 * The diagram and its history. History is a stack of documents rather than a
 * stack of markup strings, so undo cannot resurrect stale DOM and a keystroke
 * does not cost a full serialisation of the tree.
 */

import type { StateCreator } from 'zustand';
import { createDefaultDocument, findNode, type NodeId, type StructureDocument } from '../domain/document';
import { nextVariant, prevVariant, type NodeKind, type TerminalKind } from '../domain/kinds';
import * as ops from '../domain/operations';
import { clearStoredDocument } from './persistence';
import type { AppState } from './store';

const HISTORY_LIMIT = 120;
/** Edits tagged the same and made within this window become one history entry. */
const COALESCE_WINDOW_MS = 700;

export interface DocumentSlice {
  doc: StructureDocument;
  past: StructureDocument[];
  future: StructureDocument[];
  historyTag: string | null;
  historyAt: number;

  commit: (next: StructureDocument, tag?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  addChild: (parentId: NodeId, kind?: NodeKind) => NodeId | null;
  remove: (id: NodeId) => void;
  rename: (id: NodeId, name: string) => void;
  setNote: (id: NodeId, note: string) => void;
  setKind: (id: NodeId, kind: NodeKind) => void;
  /** Applies the kind, or asks first when it would drop nodes or links. */
  requestKind: (id: NodeId, kind: NodeKind) => void;
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
}

/** What selection and editing fall back to whenever the document is swapped. */
const CLEARED_FOCUS = { editingId: null, pendingKind: null } as const;

export const createDocumentSlice =
  (initial: StructureDocument): StateCreator<AppState, [], [], DocumentSlice> =>
  (set, get) => {
    /**
     * Runs a pure operation against the current document. A tag makes a run of
     * edits to the same thing (a name typed letter by letter) one undo step.
     */
    const edit = (apply: (doc: StructureDocument) => StructureDocument, tag?: string): void =>
      get().commit(apply(get().doc), tag);

    /** Moves one document between the two stacks, keeping a still-valid selection. */
    const travel = (direction: 'back' | 'forward'): void => {
      const { past, future, doc, selectedId } = get();
      const target = direction === 'back' ? past[past.length - 1] : future[0];
      if (!target) return;
      set({
        doc: target,
        past: direction === 'back' ? past.slice(0, -1) : [...past, doc].slice(-HISTORY_LIMIT),
        future: direction === 'back' ? [doc, ...future].slice(0, HISTORY_LIMIT) : future.slice(1),
        historyTag: null,
        selectedId: selectedId && findNode(target, selectedId) ? selectedId : null,
        ...CLEARED_FOCUS,
      });
    };

    return {
      doc: initial,
      past: [],
      future: [],
      historyTag: null,
      historyAt: 0,

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

      undo: () => travel('back'),
      redo: () => travel('forward'),
      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,

      /**
       * Adds a child and leaves the selection where it is. Whether adding should
       * move the user is a UI decision, so the caller makes it: clicking `+` or an
       * *Add below* button jumps to what it created, while ⇧↓ stays put so a run of
       * presses adds siblings instead of walking down the tree.
       */
      addChild: (parentId, kind) => {
        const result = ops.addChild(get().doc, parentId, kind);
        if (result.createdId === null) return null;
        get().commit(result.doc);
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

      rename: (id, name) => edit((doc) => ops.renameNode(doc, id, name), `rename:${id}`),
      setNote: (id, note) => edit((doc) => ops.setNote(doc, id, note), `note:${id}`),
      setKind: (id, kind) => {
        edit((doc) => ops.setKind(doc, id, kind));
        set({ pendingKind: null });
      },

      /**
       * Switching a kind can drop what hangs below it, so every route into it goes
       * through here: the change is only applied straight away when nothing is
       * lost. Otherwise the node is selected, its details open, and the switch
       * waits for the confirmation shown there.
       */
      requestKind: (id, kind) => {
        const { doc } = get();
        const node = findNode(doc, id);
        if (!node || node.kind === kind) return;
        const impact = ops.kindChangeImpact(doc, id, kind);
        if (impact.droppedDescendants === 0 && impact.droppedLinks === 0) {
          get().setKind(id, kind);
          return;
        }
        set({
          pendingKind: { nodeId: id, kind },
          selectedId: id,
          inspectorOpen: true,
          editingId: null,
          editingSeed: null,
        });
      },

      cycleKind: (id, direction = 'next') => {
        const node = findNode(get().doc, id);
        if (!node) return;
        const target = direction === 'next' ? nextVariant(node.kind) : prevVariant(node.kind);
        if (target) get().requestKind(id, target);
      },

      addTerminal: (id, terminal) => edit((doc) => ops.addTerminal(doc, id, terminal)),
      removeTerminalAt: (id, index) => edit((doc) => ops.removeTerminalAt(doc, id, index)),

      // Settings and versions are typed character by character, so they coalesce
      // per key rather than filling the history with single letters.
      setSetting: (id, key, value) => edit((doc) => ops.setSetting(doc, id, key, value), `setting:${id}:${key}`),
      renameSetting: (id, from, to) => edit((doc) => ops.renameSetting(doc, id, from, to), `settingKey:${id}:${from}`),
      removeSetting: (id, key) => edit((doc) => ops.removeSetting(doc, id, key)),

      addIntegration: (id, integrationId, version) =>
        edit((doc) => ops.addIntegration(doc, id, integrationId, version)),
      setIntegrationVersion: (id, position, version) =>
        edit((doc) => ops.setIntegrationVersion(doc, id, position, version), `version:${id}:${position}`),
      removeIntegrationAt: (id, position) => edit((doc) => ops.removeIntegrationAt(doc, id, position)),
      toggleMethod: (id, method) => edit((doc) => ops.toggleMethod(doc, id, method)),
      setLogoDomain: (id, domain) => edit((doc) => ops.setLogoDomain(doc, id, domain), `logo:${id}`),

      toggleLink: (a, b) => {
        const { doc, notify } = get();
        // A merchant account can only sit on one balance platform, so linking it to
        // a second one moves it instead of failing silently.
        const displaced = ops.linkAtLimit(doc, a, b);
        edit((current) => ops.toggleLink(current, a, b));
        if (displaced !== null) {
          notify(`Moved to this balance platform, replacing ${findNode(doc, displaced)?.name ?? 'the previous one'}`);
        }
      },
      move: (id, targetId, position) => edit((doc) => ops.moveNode(doc, id, targetId, position)),

      replaceDocument: (doc) => {
        set({
          doc,
          past: [...get().past, get().doc].slice(-HISTORY_LIMIT),
          future: [],
          historyTag: null,
          selectedId: null,
          inspectorOpen: false,
          ...CLEARED_FOCUS,
        });
      },

      reset: () => {
        clearStoredDocument();
        get().replaceDocument(createDefaultDocument());
      },
    };
  };
