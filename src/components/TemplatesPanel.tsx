import type { GuidedAnswers } from '../domain/guided';
import { specOf } from '../domain/kinds';
import { TEMPLATES, type Template } from '../domain/templates';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import styles from './TemplatesPanel.module.css';

export interface TemplatesPanelProps {
  readonly onApply: (template: Template) => void;
  /** Opens the guided setup, prefilled with a template's answers when given. */
  readonly onOpenGuided: (answers?: GuidedAnswers) => void;
}

export function TemplatesPanel({ onApply, onOpenGuided }: TemplatesPanelProps) {
  const open = useStore((state) => state.templatesOpen);
  const setOpen = useStore((state) => state.setTemplatesOpen);

  return (
    <aside
      className={`panel ${styles.panel} ${open ? styles.panelOpen : ''}`}
      aria-label="Templates"
      aria-hidden={!open}
      inert={!open}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Start from</h2>
          <p className={styles.subtitle}>A typical setup, or a few questions.</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Close templates">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <button type="button" className={styles.guided} onClick={() => onOpenGuided()}>
        <span className={styles.guidedIcon}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 6h11M9 12h11M9 18h11" />
            <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
          </svg>
        </span>
        <span className={styles.guidedText}>
          <span className={styles.guidedTitle}>Guided setup</span>
          <span className={styles.guidedHint}>Answer a few questions and get a diagram.</span>
        </span>
      </button>

      <span className="sectionLabel">Templates</span>
      <ul className={styles.list}>
        {TEMPLATES.map((template) => (
          <li key={template.id} className={styles.template}>
            <button
              type="button"
              className={styles.templateMain}
              onClick={() => onApply(template)}
              title={`Replace the diagram with the ${template.name} template`}
            >
              <span className={styles.icons}>
                {template.highlights.map((kind) => {
                  const spec = specOf(kind);
                  return (
                    <span key={kind} className={styles.iconChip} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
                      <Icon name={spec.icon} tint={spec.tint} size={14} />
                    </span>
                  );
                })}
              </span>
              <span className={styles.templateName}>{template.name}</span>
              <span className={styles.templateDescription}>{template.description}</span>
            </button>
            <button
              type="button"
              className={styles.adjust}
              onClick={() => onOpenGuided(template.answers)}
              title="Open this template in the guided setup to change it first"
            >
              Adjust
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
