import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { monogram, paymentLogoDataUrl, type PaymentLogoMap } from '../design/brand';
import { canAddAnyChild, canAddChildOfKind } from '../domain/document';
import { integrationLabel } from '../domain/integrations';
import { specOf } from '../domain/kinds';
import { methodLabel } from '../domain/paymentMethods';
import { useCompanyLogo } from '../hooks/useBrandMarks';
import type { LayoutNode } from '../layout';
import { CARD } from '../layout/metrics';
import { Icon, TerminalIcon } from './Icon';
import styles from './NodeCard.module.css';

export interface NodeCardProps {
  readonly item: LayoutNode;
  readonly selected: boolean;
  readonly editing: boolean;
  /** Set when typing started the edit: the editor opens with this text. */
  readonly editingSeed: string | null;
  readonly dragging: boolean;
  readonly dimmed: boolean;
  readonly dropAction: 'link' | 'inside' | null;
  readonly linkCount: number;
  readonly tabbable: boolean;
  /** Null until the logo module has loaded; marks are simply absent until then. */
  readonly paymentLogos: PaymentLogoMap | null;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  readonly onStartEdit: (id: string) => void;
  readonly onCommitName: (id: string, name: string) => void;
  readonly onCancelEdit: () => void;
  readonly onAddChild: (id: string) => void;
  readonly onAddLegalEntity: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onOpenTerminalPicker: (id: string) => void;
  readonly onRemoveTerminal: (id: string, index: number) => void;
}

export const NodeCard = memo(function NodeCard({
  item,
  selected,
  editing,
  editingSeed,
  dragging,
  dimmed,
  dropAction,
  linkCount,
  tabbable,
  paymentLogos,
  onPointerDown,
  onStartEdit,
  onCommitName,
  onCancelEdit,
  onAddChild,
  onAddLegalEntity,
  onDelete,
  onOpenTerminalPicker,
  onRemoveTerminal,
}: NodeCardProps) {
  const spec = specOf(item.kind);
  const node = item.node;
  const { slots } = item;

  const logoUrl = useCompanyLogo(slots.logo === null ? '' : node.logoDomain);
  const canAdd = canAddAnyChild(node);
  const canAddLegalEntity = canAddChildOfKind(node, 'legalEntity');
  const showTerminals = spec.supportsTerminals;

  return (
    <div
      className={styles.card}
      style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
      data-node-id={item.id}
      data-selected={selected}
      data-dragging={dragging}
      data-dimmed={dimmed && !dragging}
      data-droptarget={dropAction ?? undefined}
      data-tone={spec.tone}
      data-platform={item.insidePlatform && spec.tone !== 'management'}
      role="treeitem"
      aria-level={item.depth + 1}
      aria-selected={selected}
      aria-label={`${node.name}, ${item.caption}`}
      tabIndex={tabbable ? 0 : -1}
      onPointerDown={(event) => onPointerDown(event, item.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEdit(item.id);
      }}
    >
      {node.note.trim() !== '' ? (
        <span className={styles.noteBadge} title="Has notes">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </span>
      ) : null}

      {linkCount > 0 ? (
        <span className={styles.linkBadge} title={`${linkCount} link${linkCount > 1 ? 's' : ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9.5 14.5a4 4 0 0 0 5.7.4l2.4-2.4a4 4 0 0 0-5.6-5.7l-1.4 1.4" />
            <path d="M14.5 9.5a4 4 0 0 0-5.7-.4l-2.4 2.4a4 4 0 0 0 5.6 5.7l1.4-1.4" />
          </svg>
          {linkCount > 1 ? linkCount : null}
        </span>
      ) : null}

      <span
        className={styles.iconBox}
        style={{
          left: slots.icon.x,
          top: slots.icon.y,
          width: slots.icon.width,
          height: slots.icon.height,
          background: slots.logo === null ? `var(--tint-${spec.tint}-fill)` : 'var(--c-surface)',
        }}
        aria-hidden
      >
        {slots.logo === null ? (
          <Icon name={spec.icon} tint={spec.tint} size={CARD.iconSize - 6} />
        ) : (
          <>
            {logoUrl === null ? (
              <span className={styles.monogram} style={{ color: `var(--tint-${spec.tint}-line)` }}>
                {monogram(node.name)}
              </span>
            ) : (
              <img className={styles.logo} src={logoUrl} alt="" draggable={false} />
            )}
            {/* The brand replaces the kind glyph, so the glyph shrinks into the
                corner rather than disappearing. */}
            <span className={styles.logoKind} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
              <Icon name={spec.icon} tint={spec.tint} size={CARD.logoKindSize - 3} />
            </span>
          </>
        )}
      </span>

      {editing ? (
        <NameEditor
          initialValue={editingSeed ?? node.name}
          selectAll={editingSeed === null}
          left={CARD.paddingX - 4}
          top={slots.nameTop - 2}
          width={slots.innerWidth + 8}
          height={slots.nameLineHeight + 4}
          onCommit={(value) => onCommitName(item.id, value)}
          onCancel={onCancelEdit}
        />
      ) : (
        <div
          className={styles.name}
          style={{
            top: slots.nameTop,
            fontSize: CARD.nameSize,
            lineHeight: `${slots.nameLineHeight}px`,
            height: item.nameLines.length * slots.nameLineHeight,
          }}
          title={node.name}
        >
          {/* The measured lines are rendered verbatim so the card, the layout
              and the SVG export always break the name in the same place. */}
          {item.nameLines.map((line, index) => (
            <span key={index} className={styles.nameLine}>
              {line}
            </span>
          ))}
        </div>
      )}

      <div
        className={styles.caption}
        style={{ top: slots.captionBaselineTop, fontSize: CARD.captionSize, lineHeight: `${CARD.captionLineHeight}px` }}
      >
        {item.caption}
      </div>

      {slots.chips.map((chip, index) => (
        <span
          key={`${chip.label}-${index}`}
          className={styles.chip}
          style={{
            left: chip.x,
            top: chip.y,
            width: chip.width,
            height: chip.height,
            fontSize: CARD.chipTextSize,
          }}
          title={integrationLabel(
            node.integrations[index]?.id ?? chip.label,
            node.integrations[index]?.version ?? '',
          )}
        >
          {chip.label}
        </span>
      ))}

      {slots.methods.map((box) => {
        const url = paymentLogos === null ? null : paymentLogoDataUrl(paymentLogos, box.method);
        return (
          <span
            key={box.method}
            className={styles.method}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
            title={methodLabel(box.method)}
          >
            {url === null ? null : <img src={url} alt="" draggable={false} />}
          </span>
        );
      })}

      {slots.methodOverflowBox === null ? null : (
        <span
          className={styles.methodOverflow}
          style={{
            left: slots.methodOverflowBox.x,
            top: slots.methodOverflowBox.y,
            width: slots.methodOverflowBox.width,
            height: slots.methodOverflowBox.height,
          }}
          title={node.methods.map(methodLabel).join(', ')}
        >
          +{slots.methodOverflow}
        </span>
      )}

      {showTerminals && slots.terminalsTop !== null ? (
        <div className={styles.terminals} style={{ top: slots.terminalsTop, height: CARD.terminalRowHeight }}>
          {node.terminals.map((terminal, index) => (
            <button
              type="button"
              key={`${terminal}-${index}`}
              className={styles.terminal}
              style={{ width: CARD.terminalSize, height: CARD.terminalSize }}
              tabIndex={-1}
              title={`Remove ${terminal} terminal`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveTerminal(item.id, index);
              }}
            >
              <TerminalIcon name={terminal} size={CARD.terminalSize - 6} tint={spec.tint} />
            </button>
          ))}
          <button
            type="button"
            className={styles.addTerminal}
            style={{ width: CARD.terminalSize, height: CARD.terminalSize }}
            tabIndex={-1}
            title="Add terminal"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTerminalPicker(item.id);
            }}
          >
            +
          </button>
        </div>
      ) : null}

      {slots.badgeTop === null ? null : (
        <span
          className={styles.settingsBadge}
          style={{ top: slots.badgeTop, height: CARD.badgeHeight, fontSize: CARD.badgeTextSize }}
          title={
            slots.badgeLabel.endsWith('*')
              ? 'Some of these settings are overridden further down'
              : node.settings.map((setting) => `${setting.key}: ${setting.value}`).join('\n')
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" />
          </svg>
          {slots.badgeLabel}
        </span>
      )}

      {canAdd ? (
        <button
          type="button"
          className={`${styles.floatButton} ${styles.addButton}`}
          tabIndex={-1}
          title="Add child"
          aria-label={`Add a child to ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAddChild(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : null}

      {showTerminals && node.terminals.length === 0 ? (
        <button
          type="button"
          className={`${styles.floatButton} ${styles.terminalButton}`}
          tabIndex={-1}
          title="Add terminal"
          aria-label={`Add a terminal to ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpenTerminalPicker(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M9 7h6M9 12h2M13 12h2M9 16h2M13 16h2" />
          </svg>
        </button>
      ) : null}

      {canAddLegalEntity ? (
        <button
          type="button"
          className={`${styles.floatButton} ${styles.secondaryButton}`}
          tabIndex={-1}
          title="Add legal entity"
          aria-label={`Add a legal entity to ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAddLegalEntity(item.id);
          }}
        >
          LE
        </button>
      ) : null}

      {!spec.isRoot ? (
        <button
          type="button"
          className={`${styles.floatButton} ${styles.deleteButton}`}
          tabIndex={-1}
          title="Delete"
          aria-label={`Delete ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
});

interface NameEditorProps {
  readonly initialValue: string;
  /** False when typing opened the editor, so the seed is not wiped by the caret. */
  readonly selectAll: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly onCommit: (value: string) => void;
  readonly onCancel: () => void;
}

/**
 * A real input rather than a contenteditable span: no markup can be pasted into
 * the document and the caret behaves the way the platform expects.
 */
function NameEditor({ initialValue, selectAll, left, top, width, height, onCommit, onCancel }: NameEditorProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (selectAll) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [selectAll]);

  const commit = (): void => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  };

  return (
    <input
      ref={inputRef}
      className={styles.nameInput}
      style={{ left, top, width, height, fontSize: CARD.nameSize }}
      value={value}
      autoFocus
      spellCheck={false}
      maxLength={64}
      aria-label="Node name"
      onChange={(event) => setValue(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          committed.current = true;
          onCancel();
        }
      }}
    />
  );
}
