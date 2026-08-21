import { useMemo, useState } from 'react';
import { importFromText } from '../share/import';
import { buildImportPrompt } from '../share/prompt';
import { useStore } from '../state/store';
import { Modal } from './Modal';
import styles from './ImportDialog.module.css';

export interface ImportDialogProps {
  readonly onClose: () => void;
}

/**
 * Two halves of one workflow: take the prompt to a model along with whatever
 * notes, emails or call transcripts describe the setup, then paste what comes
 * back. Everything is parsed through the same normaliser as a share link, so a
 * model that invents a field or an impossible parent cannot corrupt the diagram.
 */
export function ImportDialog({ onClose }: ImportDialogProps) {
  const replaceDocument = useStore((state) => state.replaceDocument);
  const notify = useStore((state) => state.notify);

  const prompt = useMemo(() => buildImportPrompt(), []);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      notify('Could not reach the clipboard; select the text instead', 'error');
    }
  };

  const build = (): void => {
    const outcome = importFromText(pasted);
    if ('error' in outcome) {
      setError(outcome.error);
      return;
    }
    replaceDocument(outcome.doc);
    notify(
      outcome.source === 'link'
        ? `Opened a diagram with ${outcome.nodeCount} accounts`
        : `Built a diagram with ${outcome.nodeCount} accounts`,
      'success',
    );
    onClose();
  };

  return (
    <Modal
      title="Build from notes"
      description="Hand the prompt to any chat model together with your notes, then paste the answer back here."
      size="wide"
      onClose={onClose}
    >
      <div className={styles.body}>
        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepNumber}>1</span>
            <div>
              <h3 className={styles.stepTitle}>Take this prompt to a model</h3>
              <p className={styles.stepHint}>
                It already describes every account type, the rules about what fits inside what, and the payment
                methods this tool knows. It also tells the model to draw only what your notes mention, so nothing
                is invented to fill the diagram out.
              </p>
            </div>
            <button type="button" className={styles.copyButton} onClick={() => void copyPrompt()}>
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
          <textarea className={styles.prompt} value={prompt} readOnly spellCheck={false} rows={7} />
        </section>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepNumber}>2</span>
            <div>
              <h3 className={styles.stepTitle}>Paste the answer</h3>
              <p className={styles.stepHint}>
                JSON, with or without a code fence. A share link from this tool works here too.
              </p>
            </div>
          </div>
          <textarea
            className={styles.paste}
            value={pasted}
            spellCheck={false}
            rows={6}
            placeholder={'{\n  "root": { "kind": "company", "name": "Acme Group", "children": [] }\n}'}
            onChange={(event) => {
              setPasted(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          />
          {error === null ? null : (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>

        <div className={styles.actions}>
          <span className={styles.warning}>This replaces the diagram you have open. Undo brings it back.</span>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={pasted.trim() === ''} onClick={build}>
            Build diagram
          </button>
        </div>
      </div>
    </Modal>
  );
}
