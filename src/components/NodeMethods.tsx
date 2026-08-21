import { useState } from 'react';
import { paymentLogoDataUrl } from '../design/brand';
import type { AccountNode } from '../domain/document';
import { METHOD_GROUPS, PAYMENT_METHODS, methodLabel } from '../domain/paymentMethods';
import { usePaymentLogos } from '../hooks/useBrandMarks';
import { useStore } from '../state/store';
import { Modal } from './Modal';
import styles from './NodeMethods.module.css';

export interface NodeMethodsProps {
  readonly node: AccountNode;
}

/** The payment methods this account offers, shown with their real brand marks. */
export function NodeMethods({ node }: NodeMethodsProps) {
  const toggleMethod = useStore((state) => state.toggleMethod);
  const [picking, setPicking] = useState(false);
  // The picker needs every logo; a card only needs the chosen ones.
  const logos = usePaymentLogos(picking || node.methods.length > 0);

  return (
    <div className={styles.section}>
      <span className="sectionLabel">Payment methods</span>

      {node.methods.length === 0 ? (
        <span className={styles.empty}>None chosen yet.</span>
      ) : (
        <div className={styles.selected}>
          {node.methods.map((method) => {
            const url = logos === null ? null : paymentLogoDataUrl(logos, method);
            return (
              <button
                key={method}
                type="button"
                className={styles.selectedMark}
                title={`Remove ${methodLabel(method)}`}
                aria-label={`Remove ${methodLabel(method)}`}
                onClick={() => toggleMethod(node.id, method)}
              >
                {url === null ? <span className={styles.markText}>{methodLabel(method)}</span> : <img src={url} alt="" />}
              </button>
            );
          })}
        </div>
      )}

      <button type="button" className={styles.addButton} onClick={() => setPicking(true)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Choose methods
      </button>

      {picking ? (
        <Modal
          title="Payment methods"
          description="Logos come from Adyen's own artwork, bundled with the tool so they survive an export."
          size="wide"
          onClose={() => setPicking(false)}
        >
          <div className={styles.picker}>
            {METHOD_GROUPS.map((group) => (
              <section key={group.id} className={styles.group}>
                <h3 className={styles.groupTitle}>{group.label}</h3>
                <div className={styles.grid}>
                  {PAYMENT_METHODS.filter((method) => method.group === group.id).map((method) => {
                    const url = logos === null ? null : paymentLogoDataUrl(logos, method.id);
                    const chosen = node.methods.includes(method.id);
                    return (
                      <button
                        key={method.id}
                        type="button"
                        className={styles.option}
                        data-chosen={chosen}
                        aria-pressed={chosen}
                        title={method.label}
                        onClick={() => toggleMethod(node.id, method.id)}
                      >
                        <span className={styles.optionMark}>
                          {url === null ? null : <img src={url} alt="" />}
                        </span>
                        <span className={styles.optionLabel}>{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
