import { TERMINAL_KINDS, TERMINAL_LABELS, type TerminalKind } from '../domain/kinds';
import { Modal } from './Modal';
import { TerminalIcon } from './Icon';
import styles from './TerminalPicker.module.css';

export interface TerminalPickerProps {
  readonly onPick: (terminal: TerminalKind) => void;
  readonly onClose: () => void;
}

export function TerminalPicker({ onPick, onClose }: TerminalPickerProps) {
  return (
    <Modal title="Add a terminal" description="Terminals show which hardware a store runs." onClose={onClose}>
      <div className={styles.grid}>
        {TERMINAL_KINDS.map((terminal) => (
          <button key={terminal} type="button" className={styles.option} onClick={() => onPick(terminal)}>
            <span className={styles.optionIcon}>
              <TerminalIcon name={terminal} size={26} tint="green" />
            </span>
            {TERMINAL_LABELS[terminal]}
          </button>
        ))}
      </div>
    </Modal>
  );
}
