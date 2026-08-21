import { useEffect } from 'react';
import { findNode } from '../domain/document';
import { specOf } from '../domain/kinds';
import type { Layout } from '../layout';
import { useStore } from '../state/store';
import type { ViewportController } from './useViewport';

type Direction = 'up' | 'down' | 'left' | 'right';

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  );
}

/** Sibling and parent/child navigation over the laid-out tree. */
function neighbour(layout: Layout, id: string, direction: Direction): string | null {
  const current = layout.byId.get(id);
  if (!current) return null;

  if (direction === 'up') return current.parentId;
  if (direction === 'down') {
    const children = layout.nodes
      .filter((node) => node.parentId === id)
      .sort((a, b) => a.x - b.x);
    return children[0]?.id ?? null;
  }

  const siblings = layout.nodes
    .filter((node) => node.parentId === current.parentId)
    .sort((a, b) => a.x - b.x);
  const index = siblings.findIndex((node) => node.id === id);
  if (index === -1) return null;
  const next = direction === 'left' ? siblings[index - 1] : siblings[index + 1];
  return next?.id ?? null;
}

export interface KeyboardOptions {
  readonly layout: Layout;
  readonly view: ViewportController;
  readonly onToggleHelp: () => void;
  readonly onCloseOverlays: () => boolean;
}

export function useKeyboard({ layout, view, onToggleHelp, onCloseOverlays }: KeyboardOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useStore.getState();
      const modifier = event.metaKey || event.ctrlKey;

      if (event.key === 'Escape') {
        if (onCloseOverlays()) return;
        if (store.editingId !== null) {
          store.setEditing(null);
          return;
        }
        store.select(null);
        return;
      }

      if (isTextEntry(event.target)) return;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }

      if (modifier && (event.key === '0' || event.key === '9')) {
        event.preventDefault();
        view.fit();
        return;
      }

      if (modifier && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        view.zoomBy(1.2);
        return;
      }

      if (modifier && event.key === '-') {
        event.preventDefault();
        view.zoomBy(1 / 1.2);
        return;
      }

      // Some layouts report the unshifted key, so accept both spellings.
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        onToggleHelp();
        return;
      }

      const selectedId = store.selectedId;
      if (selectedId === null) {
        if (event.key.startsWith('Arrow')) {
          event.preventDefault();
          const root = layout.nodes[0];
          if (root) selectAndReveal(root.id, view);
        }
        return;
      }

      // Shift turns the arrows from navigation into editing: down grows the
      // tree, sideways walks through the types a card can be.
      if (event.shiftKey && event.key === 'ArrowDown') {
        event.preventDefault();
        // Selection stays on the parent, so pressing again adds another sibling
        // rather than descending. ArrowDown walks into them when you are ready.
        store.addChild(selectedId);
        return;
      }

      if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        store.cycleKind(selectedId, event.key === 'ArrowRight' ? 'next' : 'prev');
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault();
          const direction: Direction =
            event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' ? 'left' : 'right';
          const next = neighbour(layout, selectedId, direction);
          if (next) selectAndReveal(next, view);
          break;
        }
        case 'Enter':
        case 'F2': {
          event.preventDefault();
          store.setEditing(selectedId);
          break;
        }
        case 'Delete':
        case 'Backspace': {
          const node = layout.byId.get(selectedId);
          if (!node || specOf(node.kind).isRoot) break;
          event.preventDefault();
          const parentId = node.parentId;
          store.remove(selectedId);
          if (parentId) selectAndReveal(parentId, view);
          break;
        }
        default: {
          // Typing on a selected card renames it. A card still carrying its
          // default name starts from scratch; one the user has already named
          // carries on from what is there.
          if (event.key.length !== 1 || event.altKey || modifier) break;
          const node = findNode(store.doc, selectedId);
          if (!node) break;
          event.preventDefault();
          const fresh = node.name === specOf(node.kind).defaultName;
          store.setEditing(selectedId, fresh ? event.key : node.name + event.key);
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layout, onCloseOverlays, onToggleHelp, view]);
}

function selectAndReveal(id: string, view: ViewportController): void {
  useStore.getState().select(id);
  view.reveal(id);
  // Focus follows selection so screen readers and the focus ring stay in step.
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
    element?.focus({ preventScroll: true });
  });
}
