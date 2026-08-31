/**
 * The diagram lives in localStorage, so these tests stand in for "reload the
 * page" and "come back tomorrow". There is no jsdom in this project, so the
 * handful of browser globals the store touches are stubbed by hand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
}

type Listener = () => void;

interface Harness {
  readonly storage: MemoryStorage;
  readonly windowListeners: Map<string, Set<Listener>>;
  readonly documentListeners: Map<string, Set<Listener>>;
  visibility: 'visible' | 'hidden';
}

function listenerPair(listeners: Map<string, Set<Listener>>) {
  return {
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
}

function install(storage = new MemoryStorage()): Harness {
  const harness: Harness = {
    storage,
    windowListeners: new Map(),
    documentListeners: new Map(),
    visibility: 'visible',
  };

  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    ...listenerPair(harness.windowListeners),
    // Forwarded at call time so fake timers still apply.
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (handle: number) => globalThis.clearTimeout(handle),
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => undefined },
  });
  vi.stubGlobal('document', {
    ...listenerPair(harness.documentListeners),
    get visibilityState() {
      return harness.visibility;
    },
  });

  return harness;
}

function fire(listeners: Map<string, Set<Listener>>, type: string): void {
  for (const listener of listeners.get(type) ?? []) listener();
}

/** A fresh module graph, which is what a page load gives you. */
async function load() {
  vi.resetModules();
  return await import('../src/state/store');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('keeping the diagram between visits', () => {
  it('stores what is on screen at startup', async () => {
    const harness = install();
    const { startPersistence } = await load();
    const stop = startPersistence();

    const { loadStoredDocument } = await import('../src/state/persistence');
    expect(loadStoredDocument()?.doc.root.name).toBe('My Company');

    stop();
    void harness;
  });

  it('writes an edit once the typing settles', async () => {
    install();
    const { startPersistence, useStore } = await load();
    const stop = startPersistence();
    const { loadStoredDocument } = await import('../src/state/persistence');

    useStore.getState().rename(useStore.getState().doc.root.id, 'Rye & Co');
    expect(loadStoredDocument()?.doc.root.name).toBe('My Company');

    vi.advanceTimersByTime(250);
    expect(loadStoredDocument()?.doc.root.name).toBe('Rye & Co');

    stop();
  });

  it('writes the last edit when the page is hidden before the debounce fires', async () => {
    const harness = install();
    const { startPersistence, useStore } = await load();
    const stop = startPersistence();
    const { loadStoredDocument } = await import('../src/state/persistence');

    useStore.getState().rename(useStore.getState().doc.root.id, 'Closed in a hurry');
    harness.visibility = 'hidden';
    fire(harness.documentListeners, 'visibilitychange');

    expect(loadStoredDocument()?.doc.root.name).toBe('Closed in a hurry');
    stop();
  });

  it('writes the last edit when the tab goes away', async () => {
    const harness = install();
    const { startPersistence, useStore } = await load();
    const stop = startPersistence();
    const { loadStoredDocument } = await import('../src/state/persistence');

    useStore.getState().rename(useStore.getState().doc.root.id, 'Gone');
    fire(harness.windowListeners, 'pagehide');

    expect(loadStoredDocument()?.doc.root.name).toBe('Gone');
    stop();
  });

  it('comes back on the next page load, structure and all', async () => {
    const first = install();
    const { startPersistence: startFirst, useStore: firstStore } = await load();
    const stopFirst = startFirst();

    const rootId = firstStore.getState().doc.root.id;
    firstStore.getState().rename(rootId, 'Yesterday Ltd');
    const created = firstStore.getState().addChild(rootId, 'ecom');
    if (created) firstStore.getState().rename(created, 'Webshop');
    vi.advanceTimersByTime(250);
    stopFirst();

    // Same storage, new module graph: the browser reopened the page.
    install(first.storage);
    const { useStore: secondStore } = await load();

    expect(secondStore.getState().doc.root.name).toBe('Yesterday Ltd');
    expect(secondStore.getState().doc.root.children.map((child) => child.name)).toEqual(['POS', 'Webshop']);
  });

  it('starts over when the diagram is reset', async () => {
    const harness = install();
    const { startPersistence, useStore } = await load();
    const stop = startPersistence();

    useStore.getState().rename(useStore.getState().doc.root.id, 'Throwaway');
    vi.advanceTimersByTime(250);
    useStore.getState().reset();
    vi.advanceTimersByTime(250);
    stop();

    install(harness.storage);
    const { useStore: reopened } = await load();
    expect(reopened.getState().doc.root.name).toBe('My Company');
  });
});
