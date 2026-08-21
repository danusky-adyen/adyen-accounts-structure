import { useEffect, useMemo, useState } from 'react';
import { ancestorsOf, canAddChildOfKind, findNode, indexDocument, type AccountNode } from '../domain/document';
import { captionFor, specOf, variantGroupOf, type NodeKind } from '../domain/kinds';
import { kindChangeImpact } from '../domain/operations';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import styles from './Inspector.module.css';

export function Inspector() {
  const doc = useStore((state) => state.doc);
  const selectedId = useStore((state) => state.selectedId);
  const open = useStore((state) => state.inspectorOpen);
  const select = useStore((state) => state.select);
  const rename = useStore((state) => state.rename);
  const setNote = useStore((state) => state.setNote);
  const setKind = useStore((state) => state.setKind);
  const addChild = useStore((state) => state.addChild);
  const remove = useStore((state) => state.remove);
  const toggleLink = useStore((state) => state.toggleLink);

  const node = selectedId === null ? null : findNode(doc, selectedId);
  const [pendingKind, setPendingKind] = useState<NodeKind | null>(null);

  useEffect(() => {
    setPendingKind(null);
  }, [selectedId]);

  const context = useMemo(() => {
    if (!node || selectedId === null) return null;
    const index = indexDocument(doc);
    const location = index.get(selectedId);
    const parentKind = location?.parent?.kind ?? null;

    const outgoing = node.links
      .map((id) => index.get(id)?.node)
      .filter((linked): linked is AccountNode => linked !== undefined);
    const incoming: AccountNode[] = [];
    for (const [, entry] of index) {
      if (entry.node.links.includes(selectedId)) incoming.push(entry.node);
    }

    return {
      parentKind,
      trail: ancestorsOf(doc, selectedId).map((ancestor) => ancestor.name),
      linked: [...outgoing, ...incoming],
      descendants: countDescendants(node),
    };
  }, [doc, node, selectedId]);

  if (!node || !context || selectedId === null) {
    return <aside className={`panel ${styles.panel}`} aria-hidden />;
  }

  const spec = specOf(node.kind);
  const group = variantGroupOf(node.kind);
  const impact = pendingKind === null ? null : kindChangeImpact(doc, selectedId, pendingKind);

  const applyKind = (kind: NodeKind): void => {
    const nextImpact = kindChangeImpact(doc, selectedId, kind);
    if (nextImpact.droppedDescendants > 0 || nextImpact.droppedLinks > 0) {
      setPendingKind(kind);
      return;
    }
    setKind(selectedId, kind);
  };

  return (
    <aside className={`panel ${styles.panel} ${open ? styles.panelOpen : ''}`} aria-label="Node details">
      <div className={styles.header}>
        <span className={styles.iconBadge} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
          <Icon name={spec.icon} tint={spec.tint} size={26} />
        </span>
        <div className={styles.headerText}>
          {context.trail.length > 0 ? (
            <div className={styles.breadcrumb}>{context.trail.join(' › ')}</div>
          ) : null}
          <div className={styles.title}>{node.name}</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={() => select(null)} aria-label="Close details">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className={styles.description}>{spec.description}</p>

      <div className={styles.field}>
        <label className="sectionLabel" htmlFor="inspector-name">
          Name
        </label>
        <input
          id="inspector-name"
          className={styles.input}
          value={node.name}
          maxLength={64}
          spellCheck={false}
          onChange={(event) => rename(selectedId, event.target.value)}
        />
      </div>

      {group ? (
        <div className={styles.field}>
          <span className="sectionLabel">{group.label}</span>
          <div className="segmented" role="radiogroup" aria-label={group.label}>
            {group.options.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                className="segmentedOption"
                aria-checked={option.kind === node.kind}
                onClick={() => applyKind(option.kind)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {node.kind === 'balanceAcc' && context.parentKind === 'liableAccHolder' ? (
            <span className={styles.hint}>Shown as “{captionFor('balanceAcc', 'liableAccHolder')}” because its holder is liable.</span>
          ) : null}
        </div>
      ) : null}

      {impact && pendingKind ? (
        <div className={styles.warning} role="alert">
          <span>
            Switching to {specOf(pendingKind).defaultName} removes{' '}
            {impact.droppedDescendants > 0
              ? `${impact.droppedDescendants} node${impact.droppedDescendants === 1 ? '' : 's'}`
              : ''}
            {impact.droppedDescendants > 0 && impact.droppedLinks > 0 ? ' and ' : ''}
            {impact.droppedLinks > 0 ? `${impact.droppedLinks} link${impact.droppedLinks === 1 ? '' : 's'}` : ''}.
          </span>
          <div className={styles.warningActions}>
            <button
              type="button"
              className={`${styles.smallButton} ${styles.smallButtonDanger}`}
              onClick={() => {
                setKind(selectedId, pendingKind);
                setPendingKind(null);
              }}
            >
              Switch anyway
            </button>
            <button type="button" className={styles.smallButton} onClick={() => setPendingKind(null)}>
              Keep as is
            </button>
          </div>
        </div>
      ) : null}

      {spec.childKinds.length > 0 ? (
        <div className={styles.field}>
          <span className="sectionLabel">Add below</span>
          <div className={styles.chipRow}>
            {spec.childKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                className={styles.chip}
                disabled={!canAddChildOfKind(node, kind)}
                onClick={() => addChild(selectedId, kind)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {specOf(kind).defaultName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.field}>
        <span className="sectionLabel">Links</span>
        {context.linked.length === 0 ? (
          <span className={styles.empty}>
            {spec.kind === 'businessLine' || spec.kind === 'store'
              ? 'Drag a business line onto a store to link them.'
              : spec.kind === 'pos' || spec.kind === 'ecom' || spec.kind === 'bp'
                ? 'Drag one merchant account onto another to show they belong together.'
                : 'This node type does not take links.'}
          </span>
        ) : (
          context.linked.map((linked) => (
            <div key={linked.id} className={styles.linkRow}>
              <span className={styles.linkName}>{linked.name}</span>
              <span className={styles.linkKind}>{captionFor(linked.kind, null)}</span>
              <button
                type="button"
                className={styles.removeLink}
                aria-label={`Remove link to ${linked.name}`}
                onClick={() => toggleLink(selectedId, linked.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.field}>
        <label className="sectionLabel" htmlFor="inspector-note">
          Notes
        </label>
        <textarea
          id="inspector-note"
          className={styles.textarea}
          value={node.note}
          maxLength={2000}
          placeholder="Anything worth remembering about this node…"
          onChange={(event) => setNote(selectedId, event.target.value)}
        />
      </div>

      {!spec.isRoot ? (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => remove(selectedId)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
            </svg>
            Delete
            {context.descendants > 0 ? ` and ${context.descendants} below` : ''}
          </button>
          <span className={styles.hint}>⌫</span>
        </div>
      ) : null}
    </aside>
  );
}

function countDescendants(node: AccountNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}
