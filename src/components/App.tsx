import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTheme } from '../design/theme';
import type { TerminalKind } from '../domain/kinds';
import { copyPngToClipboard, exportPdf, exportPng, exportSvg } from '../export';
import { useKeyboard } from '../hooks/useKeyboard';
import { useLayout } from '../hooks/useLayout';
import { useViewport } from '../hooks/useViewport';
import { buildShareUrl } from '../share/url';
import { startupNotice, useStore } from '../state/store';
import { Canvas } from './Canvas';
import { HelpDialog } from './HelpDialog';
import { Inspector } from './Inspector';
import { ConfirmDialog } from './Modal';
import { TerminalPicker } from './TerminalPicker';
import { Toast } from './Toast';
import { Toolbar } from './Toolbar';
import styles from './App.module.css';

export function App() {
  const doc = useStore((state) => state.doc);
  const theme = useStore((state) => state.theme);
  const notify = useStore((state) => state.notify);
  const addTerminal = useStore((state) => state.addTerminal);
  const reset = useStore((state) => state.reset);

  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(doc);
  const view = useViewport(containerRef, layout);

  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [terminalFor, setTerminalFor] = useState<string | null>(null);

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

  const closeOverlays = useCallback((): boolean => {
    if (terminalFor !== null) {
      setTerminalFor(null);
      return true;
    }
    if (resetOpen) {
      setResetOpen(false);
      return true;
    }
    if (helpOpen) {
      setHelpOpen(false);
      return true;
    }
    return false;
  }, [helpOpen, resetOpen, terminalFor]);

  useKeyboard({
    layout,
    view,
    onToggleHelp: () => setHelpOpen((open) => !open),
    onCloseOverlays: closeOverlays,
  });

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

  const runExport = useCallback(
    async (action: 'png' | 'svg' | 'pdf' | 'copy') => {
      const context = { layout, theme, title: doc.root.name };
      try {
        if (action === 'svg') {
          exportSvg(context);
          notify('SVG downloaded', 'success');
          return;
        }
        if (action === 'png') {
          await exportPng(context);
          notify('PNG downloaded', 'success');
          return;
        }
        if (action === 'pdf') {
          await exportPdf(context);
          notify('PDF downloaded', 'success');
          return;
        }
        await copyPngToClipboard(context);
        notify('Image copied to your clipboard', 'success');
      } catch {
        notify('That export did not work in this browser', 'error');
      }
    },
    [doc.root.name, layout, notify, theme],
  );

  return (
    <div className={styles.app}>
      <Canvas
        containerRef={containerRef}
        layout={layout}
        view={view}
        onRequestTerminalPicker={setTerminalFor}
      />

      <Toolbar
        view={view}
        onShare={() => void handleShare()}
        onExportPng={() => void runExport('png')}
        onExportSvg={() => void runExport('svg')}
        onExportPdf={() => void runExport('pdf')}
        onCopyPng={() => void runExport('copy')}
        onReset={() => setResetOpen(true)}
        onToggleHelp={() => setHelpOpen((open) => !open)}
      />

      <Inspector />
      <Toast />

      {terminalFor !== null ? (
        <TerminalPicker
          onClose={() => setTerminalFor(null)}
          onPick={(terminal: TerminalKind) => {
            addTerminal(terminalFor, terminal);
            setTerminalFor(null);
          }}
        />
      ) : null}

      {helpOpen ? <HelpDialog onClose={() => setHelpOpen(false)} /> : null}

      {resetOpen ? (
        <ConfirmDialog
          title="Start over?"
          description="This clears the diagram in this browser and replaces it with a fresh company account. You can still undo afterwards."
          confirmLabel="Start over"
          tone="danger"
          onConfirm={() => {
            reset();
            setResetOpen(false);
            requestAnimationFrame(view.fit);
          }}
          onCancel={() => setResetOpen(false)}
        />
      ) : null}
    </div>
  );
}
