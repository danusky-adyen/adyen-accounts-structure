import { Fragment, useEffect, useRef, useState } from 'react';
import { countNodes } from '../domain/document';
import type { ExportFormat } from '../export';
import { useStore, type ThemePreference } from '../state/store';
import { useZoom } from '../state/viewport';
import type { ViewportController } from '../hooks/useViewport';
import { SaveIndicator } from './SaveIndicator';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  readonly view: ViewportController;
  readonly onShare: () => void;
  readonly onExport: (format: ExportFormat) => void;
  readonly onReset: () => void;
  readonly onToggleHelp: () => void;
  readonly onOpenImport: () => void;
}

const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<ThemePreference, string> = { system: 'System theme', light: 'Light', dark: 'Dark' };

export function Toolbar({ view, onShare, onExport, onReset, onToggleHelp, onOpenImport }: ToolbarProps) {
  const doc = useStore((state) => state.doc);
  const themePreference = useStore((state) => state.themePreference);
  const setThemePreference = useStore((state) => state.setThemePreference);
  const explainMode = useStore((state) => state.explainMode);
  const setExplainMode = useStore((state) => state.setExplainMode);
  const zoom = useZoom();
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(themePreference) + 1) % THEME_ORDER.length] ?? 'system';
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
          <SaveIndicator />
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
        <span className="divider" />
        <button
          type="button"
          className="iconButton"
          onClick={() => setExplainMode(!explainMode)}
          data-active={explainMode}
          aria-pressed={explainMode}
          title={explainMode ? 'Explain is on: hover a card to learn what it does' : 'Explain: hover a card to learn what it does'}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
          </svg>
          <span className="buttonLabel">Explain</span>
        </button>
      </div>

      <div className={`panel ${styles.bar} ${styles.topRight}`}>
        <button type="button" className="iconButton" onClick={onShare} title="Copy a share link">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M18 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z" />
            <path d="M6 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z" />
            <path d="M18 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z" />
            <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
          </svg>
          <span className="buttonLabel">Share</span>
        </button>

        <ExportMenu onExport={onExport} />

        <span className="divider" />

        <button
          type="button"
          className="iconButton"
          onClick={() => setThemePreference(nextTheme)}
          title={`${THEME_LABELS[themePreference]}, click for ${THEME_LABELS[nextTheme].toLowerCase()}`}
          aria-label={`Colour theme: ${THEME_LABELS[themePreference]}`}
        >
          <ThemeGlyph preference={themePreference} />
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
          {Math.round(zoom * 100)}%
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

interface ExportItem {
  readonly format: ExportFormat;
  readonly label: string;
  readonly hint?: string;
  /** Path data for a 24×24 stroked glyph. */
  readonly icon: readonly string[];
  /** Drawn under a separator: it copies rather than downloads. */
  readonly separate?: boolean;
}

const EXPORT_ITEMS: readonly ExportItem[] = [
  { format: 'png', label: 'PNG image', hint: '2.5×', icon: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 16l5-4 4 3 3-2 6 4'] },
  {
    format: 'jpeg',
    label: 'JPEG image',
    hint: 'smaller',
    icon: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M6.9 9.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', 'M3 17l5.5-5 4 3.5L16 12l5 5'],
  },
  { format: 'svg', label: 'SVG vector', icon: ['M4 16.5 9 7l4 7 2.5-3.5L20 16.5z', 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'] },
  { format: 'pdf', label: 'PDF document', icon: ['M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5'] },
  {
    format: 'json',
    label: 'JSON data',
    hint: 're-importable',
    icon: ['M9 4H7a2 2 0 0 0-2 2v3.5L3 12l2 2.5V18a2 2 0 0 0 2 2h2', 'M15 4h2a2 2 0 0 1 2 2v3.5l2 2.5-2 2.5V18a2 2 0 0 1-2 2h-2'],
  },
  {
    format: 'copy',
    label: 'Copy image',
    icon: ['M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M15 5H6a2 2 0 0 0-2 2v9'],
    separate: true,
  },
];

function ThemeGlyph({ preference }: { readonly preference: ThemePreference }) {
  if (preference === 'light') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }
  if (preference === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function ExportMenu({ onExport }: { readonly onExport: (format: ExportFormat) => void }) {
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
          {EXPORT_ITEMS.map((item) => (
            <Fragment key={item.format}>
              {item.separate ? <div className={styles.menuSeparator} /> : null}
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onExport(item.format);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {item.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
                {item.label}
                {item.hint ? <span className={styles.menuHint}>{item.hint}</span> : null}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
