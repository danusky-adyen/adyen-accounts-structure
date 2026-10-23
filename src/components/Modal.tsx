import { useLayoutEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  readonly title: string;
  readonly description?: string;
  /** Wide is for the pickers and the import flow, which need the room. */
  readonly size?: 'default' | 'wide';
  readonly children?: ReactNode;
  readonly onClose: () => void;
}

export function Modal({ title, description, size = 'default', children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A modal `<dialog>` sits in the top layer, so it escapes the inspector's
  // transform and scroll clipping without a portal, and the browser makes the
  // rest of the page inert, moves focus in and hands it back on close.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${size === 'wide' ? styles.dialogWide : ''}`}
      aria-label={title}
      // The dialog box has no padding of its own, so a press that lands on the
      // element itself rather than its content is a press on the backdrop.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Closing is React's call: the browser closing it by itself would leave
      // the component mounted around a closed dialog.
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // Stopped here so the canvas shortcut does not also clear the selection
        // behind a picker opened from the inspector.
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={`Close ${title}`}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
        {children}
      </div>
    </dialog>
  );
}

export interface ConfirmDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly tone?: 'primary' | 'danger';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} description={description} onClose={onCancel}>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${tone === 'danger' ? styles.buttonDanger : styles.buttonPrimary}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
