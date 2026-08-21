import { Modal } from './Modal';
import styles from './HelpDialog.module.css';

const SHORTCUTS: readonly (readonly [string, string])[] = [
  ['Click a card', 'Open its details'],
  ['Double-click a card', 'Rename it'],
  ['Drag the middle of a card', 'Link it, or move it into another node'],
  ['Drag a card by its left or right edge', 'Reorder it among its siblings'],
  ['Click a card icon', 'Cycle through the types it can be'],
  ['Arrow keys', 'Move between nodes'],
  ['N', 'Add a child to the selected node'],
  ['T', 'Change the selected node’s type'],
  ['Enter', 'Rename the selected node'],
  ['⌫', 'Delete the selected node'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘0', 'Fit the diagram to the screen'],
  ['Scroll / drag the canvas', 'Pan'],
  ['⌘ + scroll, or pinch', 'Zoom'],
  ['?', 'Show this list'],
];

export interface HelpDialogProps {
  readonly onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <Modal
      title="Building a structure"
      description="Start from the company account and work down. Everything is saved in this browser automatically."
      onClose={onClose}
    >
      <dl className={styles.list}>
        {SHORTCUTS.map(([keys, description]) => (
          <div className={styles.row} key={keys}>
            <dt className={styles.keys}>{keys}</dt>
            <dd className={styles.description}>{description}</dd>
          </div>
        ))}
      </dl>

      <a
        className={styles.feedback}
        href="https://adyen.enterprise.slack.com/team/U09JPQA23BJ"
        target="_blank"
        rel="noreferrer noopener"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
        </svg>
        Feedback and ideas: <strong>@daniel osusky</strong>
      </a>
    </Modal>
  );
}
