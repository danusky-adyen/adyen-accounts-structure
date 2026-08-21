import { useEffect, useRef, useState } from 'react';
import { countNodes } from '../domain/document';
import { useStore } from '../state/store';
import type { ViewportController } from '../hooks/useViewport';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  readonly view: ViewportController;
  readonly onShare: () => void;
  readonly onExportPng: () => void;
  readonly onExportJpeg: () => void;
  readonly onExportSvg: () => void;
  readonly onExportPdf: () => void;
  readonly onCopyPng: () => void;
  readonly onReset: () => void;
  readonly onToggleHelp: () => void;
  readonly onOpenImport: () => void;
}

export function Toolbar({
  view,
  onShare,
  onExportPng,
  onExportJpeg,
  onExportSvg,
  onExportPdf,
  onCopyPng,
  onReset,
  onToggleHelp,
  onOpenImport,
}: ToolbarProps) {
  const doc = useStore((state) => state.doc);
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const canUndo = useStore((state) => state.past.length > 0);
  const canRedo = useStore((state) => state.future.length > 0);

  const nodeCount = countNodes(doc);

  return (
    <>
      <div className={`panel ${styles.bar} ${styles.topLeft}`}>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkTitle}>{doc.root.name}</span>
          <span className={styles.wordmarkMeta}>
            {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
          </span>
        </div>
      </div>

      <div className={`panel ${styles.bar} ${styles.topCenter}`}>
        <button
          type="button"
          className="iconButton"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 8h9a5 5 0 0 1 0 10H7" />
            <path d="M7.5 4.5 4 8l3.5 3.5" />
          </svg>
        </button>
        <button
          type="button"
          className="iconButton"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M20 8h-9a5 5 0 0 0 0 10h6" />
            <path d="M16.5 4.5 20 8l-3.5 3.5" />
          </svg>
        </button>
        <span className="divider" />
        <button
          type="button"
          className="iconButton"
          onClick={onOpenImport}
          title="Build a diagram from notes with a language model"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7z" />
            <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
          </svg>
          <span className="buttonLabel">Build</span>
        </button>
        <button type="button" className="iconButton" onClick={onReset} title="Start over">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          <span className="buttonLabel">Reset</span>
        </button>
      </div>

      <div className={`panel ${styles.bar} ${styles.topRight}`}>
        <button type="button" className="iconButton" onClick={onShare} title="Copy a share link">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9.5 14.5a4 4 0 0 0 5.7.4l2.4-2.4a4 4 0 0 0-5.6-5.7l-1.4 1.4" />
            <path d="M14.5 9.5a4 4 0 0 0-5.7-.4l-2.4 2.4a4 4 0 0 0 5.6 5.7l1.4-1.4" />
          </svg>
          <span className="buttonLabel">Share</span>
        </button>

        <ExportMenu
          onExportPng={onExportPng}
          onExportJpeg={onExportJpeg}
          onExportSvg={onExportSvg}
          onExportPdf={onExportPdf}
          onCopyPng={onCopyPng}
        />

        <span className="divider" />

        <button
          type="button"
          className="iconButton"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle colour theme"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
            </svg>
          )}
        </button>

        <button type="button" className="iconButton" onClick={onToggleHelp} title="Help and shortcuts (?)">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.8 9.4a2.3 2.3 0 1 1 3.4 2.2c-.8.5-1.2 1-1.2 1.9" />
            <path d="M12 17.2h.01" />
          </svg>
        </button>
      </div>

      <div className={`panel ${styles.bar} ${styles.bottomLeft}`}>
        <button
          type="button"
          className="iconButton"
          onClick={() => view.zoomBy(1 / 1.2)}
          title="Zoom out (⌘-)"
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.zoomValue}
          onClick={() => view.zoomTo(1)}
          title="Reset zoom to 100%"
        >
          {Math.round(view.viewport.scale * 100)}%
        </button>
        <button
          type="button"
          className="iconButton"
          onClick={() => view.zoomBy(1.2)}
          title="Zoom in (⌘+)"
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span className="divider" />
        <button type="button" className="iconButton" onClick={view.fit} title="Fit to screen (⌘0)">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
          </svg>
          <span className="buttonLabel">Fit</span>
        </button>
      </div>
    </>
  );
}

interface ExportMenuProps {
  readonly onExportPng: () => void;
  readonly onExportJpeg: () => void;
  readonly onExportSvg: () => void;
  readonly onExportPdf: () => void;
  readonly onCopyPng: () => void;
}

function ExportMenu({ onExportPng, onExportJpeg, onExportSvg, onExportPdf, onCopyPng }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className={styles.menuWrapper} ref={wrapperRef}>
      <button
        type="button"
        className="iconButton"
        data-active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="Export the diagram"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3v12" />
          <path d="M8 11l4 4 4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span className="buttonLabel">Export</span>
      </button>

      {open ? (
        <div className={`panel ${styles.menu}`} role="menu">
          <button type="button" className={styles.menuItem} role="menuitem" onClick={run(onExportPng)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 16l5-4 4 3 3-2 6 4" />
            </svg>
            PNG image
            <span className={styles.menuHint}>2.5×</span>
          </button>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={run(onExportJpeg)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="M3 17l5.5-5 4 3.5L16 12l5 5" />
            </svg>
            JPEG image
            <span className={styles.menuHint}>smaller</span>
          </button>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={run(onExportSvg)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 16.5 9 7l4 7 2.5-3.5L20 16.5z" />
              <rect x="3" y="4" width="18" height="16" rx="2" />
            </svg>
            SVG vector
          </button>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={run(onExportPdf)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
              <path d="M14 3v5h5" />
            </svg>
            PDF document
          </button>
          <div className={styles.menuSeparator} />
          <button type="button" className={styles.menuItem} role="menuitem" onClick={run(onCopyPng)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M15 5H6a2 2 0 0 0-2 2v9" />
            </svg>
            Copy image
          </button>
        </div>
      ) : null}
    </div>
  );
}
