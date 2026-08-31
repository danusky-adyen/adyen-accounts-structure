import { useStore } from '../state/store';
import styles from './SaveIndicator.module.css';

const COPY = {
  saved: {
    label: 'Saved in this browser',
    title: 'This diagram is stored in this browser and comes back on your next visit. Click to save it again.',
  },
  saving: {
    label: 'Saving…',
    title: 'Writing your latest change to this browser.',
  },
  stale: {
    label: 'Another tab saved over this',
    title:
      'Another tab stored a different diagram, so this one is no longer the saved copy. Click to make this version the saved one.',
  },
  unavailable: {
    label: 'Not saved in this browser',
    title:
      'This browser will not let the diagram be stored, so it lives only in this tab. Share or export it to keep it.',
  },
} as const;

/**
 * Says whether what is on screen is what the browser has stored. There is one
 * stored diagram per browser, so a second tab can overwrite it; clicking makes
 * this tab's version the stored one again.
 */
export function SaveIndicator() {
  const status = useStore((state) => state.saveStatus);
  const saveNow = useStore((state) => state.saveNow);
  const notify = useStore((state) => state.notify);
  const copy = COPY[status];

  const onClick = (): void => {
    saveNow();
    const next = useStore.getState().saveStatus;
    if (next === 'unavailable') notify('This browser will not store the diagram', 'error');
    else notify('Saved in this browser', 'success');
  };

  return (
    <button
      type="button"
      className={styles.indicator}
      data-status={status}
      onClick={onClick}
      title={copy.title}
      aria-label={`${copy.label}. Save again.`}
    >
      <span className={styles.mark} aria-hidden>
        {status === 'saved' ? (
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
        ) : status === 'saving' ? (
          <svg viewBox="0 0 24 24" className={styles.spinner}>
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12 4.5 21 20H3z" />
            <path d="M12 10v4.2M12 17.2h.01" />
          </svg>
        )}
      </span>
      <span className={styles.label}>{copy.label}</span>
    </button>
  );
}
