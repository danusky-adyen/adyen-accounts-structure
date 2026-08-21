import { useStore } from '../state/store';
import styles from './Toast.module.css';

export function Toast() {
  const toast = useStore((state) => state.toast);
  const dismiss = useStore((state) => state.dismissToast);
  if (!toast) return null;

  return (
    <button
      type="button"
      className={styles.toast}
      data-tone={toast.tone}
      role="status"
      aria-live="polite"
      onClick={() => dismiss(toast.id)}
    >
      {toast.message}
    </button>
  );
}
