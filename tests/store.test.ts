import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countNodes, createDefaultDocument, findNode } from '../src/domain/document';
import { useStore } from '../src/state/store';
import { byName, ids } from './helpers';

function reset(): void {
  useStore.setState({
    doc: createDefaultDocument(),
    past: [],
    future: [],
    historyTag: null,
    historyAt: 0,
    selectedId: null,
    editingId: null,
    inspectorOpen: false,
    toast: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('history', () => {
  it('records one entry per edit and walks back through them', () => {
    const store = useStore.getState();
    const rootId = store.doc.root.id;

    store.addChild(rootId);
    store.addChild(rootId);
    expect(countNodes(useStore.getState().doc)).toBe(5);
    expect(useStore.getState().past).toHaveLength(2);

    useStore.getState().undo();
    expect(countNodes(useStore.getState().doc)).toBe(4);
    useStore.getState().undo();
    expect(countNodes(useStore.getState().doc)).toBe(3);
    expect(useStore.getState().canUndo()).toBe(false);

    useStore.getState().redo();
    expect(countNodes(useStore.getState().doc)).toBe(4);
    expect(useStore.getState().canRedo()).toBe(true);
  });

  it('ignores an edit that changes nothing', () => {
    const store = useStore.getState();
    store.rename(store.doc.root.id, 'My Company');
    expect(useStore.getState().past).toHaveLength(0);
    expect(store.addChild(byName(store.doc, 'Store').id)).toBeNull();
    expect(useStore.getState().past).toHaveLength(0);
  });

  it('merges typing into a single undo step, per node', () => {
    const rootId = useStore.getState().doc.root.id;
    const storeId = byName(useStore.getState().doc, 'Store').id;

    useStore.getState().rename(rootId, 'A');
    useStore.getState().rename(rootId, 'Ac');
    useStore.getState().rename(rootId, 'Acme');
    expect(useStore.getState().past).toHaveLength(1);

    // A different node starts its own entry.
    useStore.getState().rename(storeId, 'Shop');
    expect(useStore.getState().past).toHaveLength(2);

    // So does typing again after the window closes.
    vi.advanceTimersByTime(1500);
    useStore.getState().rename(storeId, 'Shop 1');
    expect(useStore.getState().past).toHaveLength(3);

    useStore.getState().undo();
    expect(byName(useStore.getState().doc, 'Shop')).toBeTruthy();
    useStore.getState().undo();
    useStore.getState().undo();
    expect(useStore.getState().doc.root.name).toBe('My Company');
  });

  it('drops the redo stack once a new edit lands', () => {
    const rootId = useStore.getState().doc.root.id;
    useStore.getState().addChild(rootId);
    useStore.getState().undo();
    expect(useStore.getState().canRedo()).toBe(true);

    useStore.getState().addChild(rootId);
    expect(useStore.getState().canRedo()).toBe(false);
  });

  it('clears a selection that undo removed', () => {
    const rootId = useStore.getState().doc.root.id;
    const created = useStore.getState().addChild(rootId);
    useStore.getState().select(created);
    expect(useStore.getState().selectedId).toBe(created);

    useStore.getState().undo();
    expect(useStore.getState().selectedId).toBeNull();
  });

  it('keeps a selection that still exists', () => {
    const rootId = useStore.getState().doc.root.id;
    const storeId = byName(useStore.getState().doc, 'Store').id;

    useStore.getState().select(rootId);
    useStore.getState().rename(storeId, 'Shop');
    useStore.getState().undo();

    expect(useStore.getState().selectedId).toBe(rootId);
    expect(byName(useStore.getState().doc, 'Store')).toBeTruthy();
  });
});

describe('editing actions', () => {
  it('selects what it creates', () => {
    const created = useStore.getState().addChild(useStore.getState().doc.root.id);
    expect(useStore.getState().selectedId).toBe(created);
    expect(useStore.getState().inspectorOpen).toBe(true);
  });

  it('cycles a kind through its variant group', () => {
    const merchantId = ids(useStore.getState().doc)[1] as string;
    useStore.getState().cycleKind(merchantId);
    expect(findNode(useStore.getState().doc, merchantId)?.kind).toBe('ecom');
    useStore.getState().cycleKind(merchantId);
    expect(findNode(useStore.getState().doc, merchantId)?.kind).toBe('bp');
  });

  it('deselects a node it deletes', () => {
    const storeId = byName(useStore.getState().doc, 'Store').id;
    useStore.getState().select(storeId);
    useStore.getState().remove(storeId);

    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().inspectorOpen).toBe(false);
    expect(countNodes(useStore.getState().doc)).toBe(2);
  });

  it('replaces the document but keeps it undoable', () => {
    const before = useStore.getState().doc;
    useStore.getState().replaceDocument(createDefaultDocument());
    expect(useStore.getState().doc).not.toBe(before);

    useStore.getState().undo();
    expect(useStore.getState().doc).toBe(before);
  });
});

describe('toasts', () => {
  it('shows the latest message and clears it on a timer', () => {
    useStore.getState().notify('Linked', 'success');
    expect(useStore.getState().toast?.message).toBe('Linked');

    vi.advanceTimersByTime(4000);
    expect(useStore.getState().toast).toBeNull();
  });

  it('can be dismissed early, and a stale timer does not clear a newer toast', () => {
    useStore.getState().notify('First');
    const first = useStore.getState().toast?.id ?? 0;
    useStore.getState().dismissToast(first);
    expect(useStore.getState().toast).toBeNull();

    useStore.getState().notify('Second');
    useStore.getState().dismissToast(first);
    expect(useStore.getState().toast?.message).toBe('Second');
  });
});
