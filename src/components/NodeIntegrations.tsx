import { useState } from 'react';
import type { AccountNode } from '../domain/document';
import { INTEGRATIONS, INTEGRATION_GROUPS, integrationSpec } from '../domain/integrations';
import { useStore } from '../state/store';
import { Modal } from './Modal';
import styles from './NodeIntegrations.module.css';

export interface NodeIntegrationsProps {
  readonly node: AccountNode;
}

/** How a merchant account connects to Adyen, and on which version. */
export function NodeIntegrations({ node }: NodeIntegrationsProps) {
  const addIntegration = useStore((state) => state.addIntegration);
  const setIntegrationVersion = useStore((state) => state.setIntegrationVersion);
  const removeIntegrationAt = useStore((state) => state.removeIntegrationAt);
  const [picking, setPicking] = useState(false);

  return (
    <div className={styles.section}>
      <span className="sectionLabel">Integrations</span>

      {node.integrations.length === 0 ? (
        <span className={styles.empty}>Nothing added yet.</span>
      ) : (
        node.integrations.map((entry, index) => {
          const spec = integrationSpec(entry.id);
          return (
            <div className={styles.row} key={`${entry.id}-${index}`}>
              <span className={styles.name} title={spec?.label ?? entry.id}>
                {spec?.label ?? entry.id}
              </span>
              <input
                className={styles.version}
                value={entry.version}
                placeholder="Version"
                spellCheck={false}
                maxLength={24}
                list={spec && spec.versions.length > 0 ? `versions-${entry.id}` : undefined}
                aria-label={`Version of ${spec?.label ?? entry.id}`}
                onChange={(event) => setIntegrationVersion(node.id, index, event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
              {spec && spec.versions.length > 0 ? (
                <datalist id={`versions-${entry.id}`}>
                  {spec.versions.map((version) => (
                    <option key={version} value={version} />
                  ))}
                </datalist>
              ) : null}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${spec?.label ?? entry.id}`}
                onClick={() => removeIntegrationAt(node.id, index)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          );
        })
      )}

      <button type="button" className={styles.addButton} onClick={() => setPicking(true)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add integration
      </button>

      {picking ? (
        <Modal
          title="Add an integration"
          description="How this account connects to Adyen. Versions are free text, so anything the registry does not list still fits."
          size="wide"
          onClose={() => setPicking(false)}
        >
          <div className={styles.picker}>
            {INTEGRATION_GROUPS.map((group) => (
              <section key={group.id} className={styles.group}>
                <h3 className={styles.groupTitle}>{group.label}</h3>
                <div className={styles.options}>
                  {INTEGRATIONS.filter((integration) => integration.group === group.id).map((integration) => (
                    <button
                      key={integration.id}
                      type="button"
                      className={styles.option}
                      onClick={() => {
                        addIntegration(node.id, integration.id, integration.versions[0] ?? '');
                        setPicking(false);
                      }}
                    >
                      {integration.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
