/**
 * Everything about the session that is not the diagram: what is selected or
 * being edited, the drag in flight, the theme, the toast and the save state.
 * None of it goes into history, a share link or storage (bar the theme,
 * Explain mode and whether the templates panel is open).
 */

import type { StateCreator } from 'zustand';
import type { NodeId } from '../domain/document';
import type { NodeKind } from '../domain/kinds';
import type { ThemeName } from '../design/palette';
import { systemTheme } from '../design/theme';
import {
  loadExplainMode,
  loadTemplatesOpen,
  loadThemePreference,
  saveExplainMode,
  saveTemplatesOpen,
  saveThemePreference,
} from './persistence';
import type { AppState } from './store';

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

/**
 * `stale` means another tab has written a different diagram over the stored one.
 * Nothing is lost in this tab, but the browser's copy is no longer what is on
 * screen here, and saving again is what makes this version the stored one.
 */
export type SaveStatus = 'saved' | 'saving' | 'stale' | 'unavailable';

/** A kind change that would drop nodes or links, waiting to be confirmed. */
export interface PendingKind {
  readonly nodeId: NodeId;
  readonly kind: NodeKind;
}

/** What the user picked; `system` follows the operating system as it changes. */
export type ThemePreference = 'system' | ThemeName;

export interface UiSlice {
  selectedId: NodeId | null;
  editingId: NodeId | null;
  /** Text the name editor opens with, when typing started the edit. */
  editingSeed: string | null;
  hoveredId: NodeId | null;
  hoveredLinkId: string | null;
  drag: DragState | null;
  inspectorOpen: boolean;
  pendingKind: PendingKind | null;

  themePreference: ThemePreference;
  /** The theme actually shown, with `system` resolved. */
  theme: ThemeName;
  /** Hovering a card explains what that level of the structure is for. */
  explainMode: boolean;
  /** The templates panel on the left. */
  templatesOpen: boolean;
  toast: Toast | null;
  saveStatus: SaveStatus;

  /** Selects a card and opens its details, unless `inspect` is false: then the sidebar stays as it was. */
  select: (id: NodeId | null, options?: { readonly inspect?: boolean }) => void;
  setEditing: (id: NodeId | null, seed?: string) => void;
  setHovered: (id: NodeId | null) => void;
  setHoveredLink: (id: string | null) => void;
  setDrag: (drag: DragState | null) => void;
  setInspectorOpen: (open: boolean) => void;
  clearPendingKind: () => void;

  setThemePreference: (preference: ThemePreference) => void;
  /** Called with the OS theme whenever it changes. */
  setSystemTheme: (theme: ThemeName) => void;
  setExplainMode: (on: boolean) => void;
  setTemplatesOpen: (open: boolean) => void;
  /**
   * Writes the current diagram to storage now, whatever is in there. A no-op
   * until autosave starts and installs the real one.
   */
  saveNow: () => void;
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const TOAST_MS = 3200;

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => {
  let toastCounter = 0;
  const preference = loadThemePreference() ?? 'system';

  return {
    selectedId: null,
    editingId: null,
    editingSeed: null,
    hoveredId: null,
    hoveredLinkId: null,
    drag: null,
    inspectorOpen: false,
    pendingKind: null,

    themePreference: preference,
    theme: preference === 'system' ? systemTheme() : preference,
    explainMode: loadExplainMode(),
    templatesOpen: loadTemplatesOpen(),
    toast: null,
    saveStatus: 'saved',

    select: (id, options) =>
      set({
        selectedId: id,
        inspectorOpen: id !== null && (options?.inspect === false ? get().inspectorOpen : true),
        editingId: null,
        editingSeed: null,
        pendingKind: null,
      }),
    setEditing: (id, seed) => set({ editingId: id, editingSeed: seed ?? null }),
    setHovered: (id) => set({ hoveredId: id }),
    setHoveredLink: (id) => set({ hoveredLinkId: id }),
    setDrag: (drag) => set({ drag }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    clearPendingKind: () => set({ pendingKind: null }),

    setThemePreference: (next) => {
      saveThemePreference(next);
      set({ themePreference: next, theme: next === 'system' ? systemTheme() : next });
    },
    setSystemTheme: (theme) => {
      if (get().themePreference === 'system') set({ theme });
    },

    setExplainMode: (on) => {
      saveExplainMode(on);
      set({ explainMode: on });
    },
    setTemplatesOpen: (open) => {
      saveTemplatesOpen(open);
      set({ templatesOpen: open });
    },

    saveNow: () => {},

    notify: (message, tone = 'info') => {
      toastCounter += 1;
      const id = toastCounter;
      set({ toast: { id, message, tone } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, TOAST_MS);
    },

    dismissToast: (id) => {
      if (get().toast?.id === id) set({ toast: null });
    },
  };
};
