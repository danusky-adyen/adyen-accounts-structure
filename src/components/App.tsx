import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTheme } from '../design/theme';
import type { TerminalKind } from '../domain/kinds';
import { exportDiagram, type ExportFormat } from '../export';
import { useKeepInView } from '../hooks/useKeepInView';
import { useKeyboard } from '../hooks/useKeyboard';
import { useLayout } from '../hooks/useLayout';
import { useViewport } from '../hooks/useViewport';
import { buildShareUrl } from '../share/url';
import { startupNotice, useStore } from '../state/store';
import { Canvas } from './Canvas';
import { HelpDialog } from './HelpDialog';
import { ImportDialog } from './ImportDialog';
import { Inspector } from './Inspector';
import { ConfirmDialog } from './Modal';
import { TerminalPicker } from './TerminalPicker';
import { Toast } from './Toast';
import { Toolbar } from './Toolbar';
import styles from './App.module.css';

/** At most one dialog is open at a time, so which one is a single value. */
type Overlay =
  | { readonly type: 'help' }
  | { readonly type: 'reset' }
  | { readonly type: 'import' }
  | { readonly type: 'terminal'; readonly nodeId: string };

export function App() {
  const doc = useStore((state) => state.doc);
  const theme = useStore((state) => state.theme);
  const notify = useStore((state) => state.notify);
  const addTerminal = useStore((state) => state.addTerminal);
  const reset = useStore((state) => state.reset);

  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(doc);
  const view = useViewport(containerRef, layout);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const close = useCallback(() => setOverlay(null), []);
  const toggleHelp = useCallback(
    () => setOverlay((current) => (current?.type === 'help' ? null : { type: 'help' })),
    [],
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    view.fit();
    if (startupNotice) notify(startupNotice);
  }, [notify, view]);

  useKeepInView(layout, view);
  useKeyboard({ layout, view, onToggleHelp: toggleHelp });

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(doc, new URL(window.location.href));
    try {
      await navigator.clipboard.writeText(url);
      notify('Share link copied to your clipboard', 'success');
    } catch {
      // Clipboard access can be blocked; showing the link keeps sharing possible.
      window.prompt('Copy this link', url);
    }
  }, [doc, notify]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        notify(await exportDiagram(format, doc, { layout, theme, title: doc.root.name }), 'success');
      } catch {
        notify('That export did not work in this browser', 'error');
      }
    },
    [doc, layout, notify, theme],
  );

  return (
    <div className={styles.app}>
      <Canvas
        containerRef={containerRef}
        layout={layout}
        view={view}
        onRequestTerminalPicker={(nodeId) => setOverlay({ type: 'terminal', nodeId })}
      />

      <Toolbar
        view={view}
        onShare={() => void handleShare()}
        onExport={(format) => void handleExport(format)}
        onReset={() => setOverlay({ type: 'reset' })}
        onToggleHelp={toggleHelp}
        onOpenImport={() => setOverlay({ type: 'import' })}
      />

      <Inspector />
      <Toast />

      {overlay?.type === 'terminal' ? (
        <TerminalPicker
          onClose={close}
          onPick={(terminal: TerminalKind) => {
            addTerminal(overlay.nodeId, terminal);
            close();
          }}
        />
      ) : null}

      {overlay?.type === 'import' ? (
        <ImportDialog onClose={close} onBuilt={() => requestAnimationFrame(view.fit)} />
      ) : null}

      {overlay?.type === 'help' ? <HelpDialog onClose={close} /> : null}

      {overlay?.type === 'reset' ? (
        <ConfirmDialog
          title="Start over?"
          description="This clears the diagram in this browser and replaces it with a fresh company account. You can still undo afterwards."
          confirmLabel="Start over"
          tone="danger"
          onConfirm={() => {
            reset();
            close();
            requestAnimationFrame(view.fit);
          }}
          onCancel={close}
        />
      ) : null}
    </div>
  );
}
