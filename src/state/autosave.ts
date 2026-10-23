import type { StructureDocument } from '../domain/document';
import { isDocumentStorageKey, readSerializedDocument, saveDocument } from './persistence';
import { useStore } from './store';
import type { SaveStatus } from './uiSlice';

const DEBOUNCE_MS = 250;

/**
 * Write-through to localStorage, so what is on screen is what comes back on the
 * next visit, whether that is in a minute or next week.
 *
 * Writes are debounced because a rename fires per keystroke, and flushed when
 * the page is hidden or closed: without that, the last edit before a reload or
 * a closed tab is the one that gets lost. The document present at startup is
 * written straight away, so a diagram opened from a share link is what a reload
 * shows rather than whatever was stored before it.
 *
 * There is one stored diagram per browser, so a second tab writing to it makes
 * this tab's copy no longer the stored one. The text this tab last wrote is
 * kept, and anything else appearing in storage flips the status to `stale` so
 * the indicator can say so instead of the two tabs quietly fighting.
 */
export function startPersistence(): () => void {
  let timer: number | undefined;
  let pending: StructureDocument | null = null;
  let lastSaved: StructureDocument | null = null;
  let lastWritten: string | null = null;

  const setStatus = (status: SaveStatus): void => {
    if (useStore.getState().saveStatus !== status) useStore.setState({ saveStatus: status });
  };

  const write = (doc: StructureDocument): void => {
    const json = saveDocument(doc);
    lastSaved = doc;
    pending = null;
    if (json === null) {
      // Storage is blocked or full: say so rather than claiming a save.
      setStatus('unavailable');
      return;
    }
    lastWritten = json;
    setStatus('saved');
  };

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const flush = (): void => {
    clearTimer();
    if (pending === null) return;
    write(pending);
  };

  /** Makes this tab's diagram the stored one, pending edits or not. */
  const saveNow = (): void => {
    clearTimer();
    write(useStore.getState().doc);
  };

  /** Storage holding something this tab did not write means another tab did. */
  const checkForForeignWrite = (): void => {
    if (lastWritten === null) return;
    if (readSerializedDocument() !== lastWritten) setStatus('stale');
  };

  write(useStore.getState().doc);

  const unsubscribe = useStore.subscribe((state) => {
    if (state.doc === lastSaved) return;
    pending = state.doc;
    setStatus('saving');
    clearTimer();
    timer = window.setTimeout(flush, DEBOUNCE_MS);
  });

  // `pagehide` covers navigation and tab close, including iOS Safari where
  // `beforeunload` never fires; `visibilitychange` covers a tab left in the
  // background and killed later.
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
    else checkForForeignWrite();
  };
  const onStorage = (event: StorageEvent): void => {
    if (!isDocumentStorageKey(event.key)) return;
    // `storage` only fires in the other tabs, so this is never our own write,
    // unless a second tab happens to have saved the very same text.
    if (event.newValue !== null && event.newValue === lastWritten) return;
    setStatus('stale');
  };

  window.addEventListener('pagehide', flush);
  window.addEventListener('storage', onStorage);
  // A tab that never lost visibility, side by side with another window, only
  // learns about a write it slept through when it is used again.
  window.addEventListener('focus', checkForForeignWrite);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const previousSaveNow = useStore.getState().saveNow;
  useStore.setState({ saveNow });

  return () => {
    flush();
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', checkForForeignWrite);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (useStore.getState().saveNow === saveNow) useStore.setState({ saveNow: previousSaveNow });
    unsubscribe();
  };
}
