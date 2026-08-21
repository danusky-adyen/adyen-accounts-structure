import { useMemo, useState } from 'react';
import type { NodeId, StructureDocument } from '../domain/document';
import { knownSettingKeys, resolveSettings, type ResolvedSetting } from '../domain/settings';
import { useStore } from '../state/store';
import styles from './NodeSettings.module.css';

export interface NodeSettingsProps {
  readonly doc: StructureDocument;
  readonly nodeId: NodeId;
}

/**
 * Configuration for one account, resolved the way Adyen resolves it: a value
 * set here replaces the one inherited from above, and every row says which
 * level it came from. The reverse direction matters just as much, so a row also
 * says when an account further down disagrees with it.
 */
export function NodeSettings({ doc, nodeId }: NodeSettingsProps) {
  const setSetting = useStore((state) => state.setSetting);
  const renameSetting = useStore((state) => state.renameSetting);
  const removeSetting = useStore((state) => state.removeSetting);
  const select = useStore((state) => state.select);

  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');

  const resolved = useMemo(() => resolveSettings(doc, nodeId), [doc, nodeId]);
  const suggestions = useMemo(() => knownSettingKeys(doc), [doc]);

  const own = resolved.filter((entry) => entry.source === 'own');
  const inherited = resolved.filter((entry) => entry.source === 'inherited');

  const add = (): void => {
    if (draftKey.trim() === '') return;
    setSetting(nodeId, draftKey, draftValue);
    setDraftKey('');
    setDraftValue('');
  };

  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <span className="sectionLabel">Settings</span>
        {resolved.length > 0 ? (
          <span className={styles.count}>
            {own.length} here{inherited.length > 0 ? `, ${inherited.length} inherited` : ''}
          </span>
        ) : null}
      </div>

      {own.map((entry) => (
        <OwnRow
          key={entry.key}
          entry={entry}
          onRename={(next) => renameSetting(nodeId, entry.key, next)}
          onValue={(next) => setSetting(nodeId, entry.key, next)}
          onRemove={() => removeSetting(nodeId, entry.key)}
          onReveal={select}
        />
      ))}

      {inherited.map((entry) => (
        <InheritedRow
          key={entry.key}
          entry={entry}
          onOverride={() => setSetting(nodeId, entry.key, entry.value)}
          onReveal={select}
        />
      ))}

      <div className={styles.addRow}>
        <input
          className={styles.keyInput}
          value={draftKey}
          placeholder="Parameter"
          spellCheck={false}
          maxLength={80}
          list="setting-key-suggestions"
          aria-label="New parameter name"
          onChange={(event) => setDraftKey(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') add();
          }}
        />
        <input
          className={styles.valueInput}
          value={draftValue}
          placeholder="Value"
          spellCheck={false}
          maxLength={200}
          aria-label="New parameter value"
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') add();
          }}
        />
        <button
          type="button"
          className={styles.addButton}
          disabled={draftKey.trim() === ''}
          aria-label="Add setting"
          onClick={add}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Keys already used elsewhere in the diagram, so the same parameter is
          spelled the same way at every level. */}
      <datalist id="setting-key-suggestions">
        {suggestions.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
    </div>
  );
}

interface OwnRowProps {
  readonly entry: ResolvedSetting;
  readonly onRename: (next: string) => void;
  readonly onValue: (next: string) => void;
  readonly onRemove: () => void;
  readonly onReveal: (id: NodeId) => void;
}

function OwnRow({ entry, onRename, onValue, onRemove, onReveal }: OwnRowProps) {
  return (
    <div className={styles.row} data-source="own">
      <div className={styles.rowFields}>
        <input
          className={styles.keyInput}
          value={entry.key}
          spellCheck={false}
          maxLength={80}
          aria-label={`Parameter name, currently ${entry.key}`}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <input
          className={styles.valueInput}
          value={entry.value}
          spellCheck={false}
          maxLength={200}
          placeholder="Value"
          aria-label={`Value of ${entry.key}`}
          onChange={(event) => onValue(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <button type="button" className={styles.removeButton} aria-label={`Remove ${entry.key}`} onClick={onRemove}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className={styles.tags}>
        <span className={styles.tag} data-kind="own">
          Set here
        </span>
        {entry.inheritedFrom ? (
          <button
            type="button"
            className={styles.tagButton}
            title={`Replaces “${entry.inheritedValue ?? ''}” from ${entry.inheritedFrom.name}`}
            onClick={() => entry.inheritedFrom && onReveal(entry.inheritedFrom.id)}
          >
            Overrides {entry.inheritedFrom.name}
          </button>
        ) : null}
        {entry.overriddenBy.length > 0 ? (
          <OverriddenTag entry={entry} onReveal={onReveal} />
        ) : null}
      </div>
    </div>
  );
}

interface InheritedRowProps {
  readonly entry: ResolvedSetting;
  readonly onOverride: () => void;
  readonly onReveal: (id: NodeId) => void;
}

function InheritedRow({ entry, onOverride, onReveal }: InheritedRowProps) {
  return (
    <div className={styles.row} data-source="inherited">
      {/* The parameter name gets the whole line: it is what identifies the row,
          and Adyen property names are long. */}
      <span className={styles.keyText} title={entry.key}>
        {entry.key}
      </span>
      <span className={styles.valueText} title={entry.value}>
        {entry.value === '' ? '—' : entry.value}
      </span>

      <div className={styles.tags}>
        {entry.inheritedFrom ? (
          <button
            type="button"
            className={styles.tagButton}
            onClick={() => entry.inheritedFrom && onReveal(entry.inheritedFrom.id)}
          >
            From {entry.inheritedFrom.name}
          </button>
        ) : null}
        {entry.overriddenBy.length > 0 ? <OverriddenTag entry={entry} onReveal={onReveal} /> : null}
        <button type="button" className={styles.overrideButton} title="Set a different value here" onClick={onOverride}>
          Override
        </button>
      </div>
    </div>
  );
}

function OverriddenTag({ entry, onReveal }: { entry: ResolvedSetting; onReveal: (id: NodeId) => void }) {
  const first = entry.overriddenBy[0];
  const label =
    entry.overriddenBy.length === 1
      ? `Overridden in ${first?.name ?? 'one account'}`
      : `Overridden in ${entry.overriddenBy.length} accounts below`;

  return (
    <button
      type="button"
      className={styles.tagButton}
      data-kind="overridden"
      title={entry.overriddenBy.map((origin) => origin.name).join(', ')}
      onClick={() => first && onReveal(first.id)}
    >
      {label}
    </button>
  );
}
