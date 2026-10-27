import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../design/motion';
import { applyTheme } from '../design/theme';
import type { StructureDocument } from '../domain/document';
import { buildFromAnswers, type GuidedAnswers } from '../domain/guided';
import type { TerminalKind } from '../domain/kinds';
import type { Template } from '../domain/templates';
import { exportDiagram, type ExportFormat } from '../export';
import { useKeepInView } from '../hooks/useKeepInView';
import { useKeyboard } from '../hooks/useKeyboard';
import { useLayout } from '../hooks/useLayout';
import { useViewport } from '../hooks/useViewport';
import { buildShareUrl } from '../share/url';
import { startupNotice, useStore } from '../state/store';
import { Canvas, type IntroState } from './Canvas';
import { HelpDialog } from './HelpDialog';
import { ImportDialog } from './ImportDialog';
import { Inspector } from './Inspector';
import { GuidedSetup } from './GuidedSetup';
import { ConfirmDialog } from './Modal';
import { TemplatesPanel } from './TemplatesPanel';
import { TerminalPicker } from './TerminalPicker';
import { Toast } from './Toast';
import { Toolbar } from './Toolbar';
import styles from './App.module.css';

/** At most one dialog is open at a time, so which one is a single value. */
type Overlay =
  | { readonly type: 'help' }
  | { readonly type: 'reset' }
  | { readonly type: 'import' }
  | { readonly type: 'guided'; readonly answers: GuidedAnswers | undefined }
  | { readonly type: 'terminal'; readonly nodeId: string };

export function App() {
  const doc = useStore((state) => state.doc);
  const theme = useStore((state) => state.theme);
  const notify = useStore((state) => state.notify);
  const addTerminal = useStore((state) => state.addTerminal);
  const reset = useStore((state) => state.reset);
  const replaceDocument = useStore((state) => state.replaceDocument);

  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(doc);
  const view = useViewport(containerRef, layout);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [intro, setIntro] = useState<IntroState | null>(() =>
    prefersReducedMotion() ? null : { key: 0, phase: 'assemble' },
  );
  const playIntro = useCallback(() => {
    if (!prefersReducedMotion()) setIntro((current) => ({ key: (current?.key ?? 0) + 1, phase: 'assemble' }));
  }, []);
  const revealIntro = useCallback(
    () => setIntro((current) => (current === null ? null : { ...current, phase: 'reveal' })),
    [],
  );
  const endIntro = useCallback(() => setIntro(null), []);
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

  const showNewDiagram = useCallback(
    (next: StructureDocument, message: string) => {
      replaceDocument(next);
      notify(message, 'success');
      playIntro();
      requestAnimationFrame(view.fit);
    },
    [notify, playIntro, replaceDocument, view],
  );

  const applyTemplate = useCallback(
    (template: Template) =>
      showNewDiagram(buildFromAnswers(template.answers), `Loaded ${template.name}. Undo brings your diagram back.`),
    [showNewDiagram],
  );

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
    <div className={styles.app} data-intro={intro?.phase}>
      <Canvas
        containerRef={containerRef}
        layout={layout}
        view={view}
        intro={intro}
        onIntroReveal={revealIntro}
        onIntroDone={endIntro}
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

      <TemplatesPanel onApply={applyTemplate} onOpenGuided={(answers) => setOverlay({ type: 'guided', answers })} />

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
        <ImportDialog
          onClose={close}
          onBuilt={() => {
            playIntro();
            requestAnimationFrame(view.fit);
          }}
        />
      ) : null}

      {overlay?.type === 'guided' ? (
        <GuidedSetup
          initial={overlay.answers}
          onClose={close}
          onBuild={(built) => {
            close();
            showNewDiagram(built, 'Diagram created. Undo brings your previous one back.');
          }}
        />
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
            playIntro();
            requestAnimationFrame(view.fit);
          }}
          onCancel={close}
        />
      ) : null}
    </div>
  );
}
