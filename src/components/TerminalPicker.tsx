import { TERMINAL_GROUPS, TERMINAL_LABELS, terminalCategoryOf, type TerminalKind } from '../domain/kinds';
import { Modal } from './Modal';
import { TerminalIcon } from './Icon';
import styles from './TerminalPicker.module.css';

export interface TerminalPickerProps {
  readonly onPick: (terminal: TerminalKind) => void;
  readonly onClose: () => void;
}

export function TerminalPicker({ onPick, onClose }: TerminalPickerProps) {
  return (
    <Modal
      title="Add a terminal"
      description="Terminals show which hardware a store runs."
      onClose={onClose}
    >
      {TERMINAL_GROUPS.map((group) => (
        <section key={group.category} className={styles.group}>
          <span className="sectionLabel">{group.label}</span>
          <div className={styles.grid}>
            {group.models.map((terminal) => (
              <button key={terminal} type="button" className={styles.option} onClick={() => onPick(terminal)}>
                <span className={styles.optionIcon}>
                  <TerminalIcon name={terminalCategoryOf(terminal)} size={26} tint="green" />
                </span>
                {TERMINAL_LABELS[terminal]}
              </button>
            ))}
          </div>
        </section>
      ))}
    </Modal>
  );
}
