import { useId, useMemo, useState, type ReactNode } from 'react';
import { collectLinks, forEachNode, type StructureDocument } from '../domain/document';
import {
  DEFAULT_ANSWERS,
  GUIDED_LIMITS,
  buildFromAnswers,
  segmentsOf,
  type AccountSplit,
  type GuidedAnswers,
} from '../domain/guided';
import { INTEGRATIONS, INTEGRATION_GROUPS, type IntegrationGroupId } from '../domain/integrations';
import { NODE_KINDS, TERMINAL_CATEGORIES, specOf, terminalLabel, type NodeKind } from '../domain/kinds';
import { methodLabel } from '../domain/paymentMethods';
import { Icon, TerminalIcon } from './Icon';
import { Modal } from './Modal';
import styles from './GuidedSetup.module.css';

export interface GuidedSetupProps {
  /** Where to start: a template's answers, or the defaults. */
  readonly initial?: GuidedAnswers | undefined;
  readonly onClose: () => void;
  readonly onBuild: (doc: StructureDocument) => void;
}

type StepId = 'company' | 'channels' | 'online' | 'inPerson' | 'platform' | 'review';

const STEP_TITLES: Record<StepId, string> = {
  company: 'Company',
  channels: 'Channels',
  online: 'Online',
  inPerson: 'In person',
  platform: 'Platform',
  review: 'Review',
};

function stepsFor(answers: GuidedAnswers): StepId[] {
  return [
    'company',
    'channels',
    ...(answers.online ? (['online'] as const) : []),
    ...(answers.inPerson ? (['inPerson'] as const) : []),
    ...(answers.platform ? (['platform'] as const) : []),
    'review',
  ];
}

const SPLITS: readonly { readonly value: AccountSplit; readonly label: string }[] = [
  { value: 'single', label: 'One set' },
  { value: 'country', label: 'Per country' },
  { value: 'brand', label: 'Per brand' },
];

const POPULAR_METHODS = [
  'visa',
  'mc',
  'amex',
  'applepay',
  'googlepay',
  'paypal',
  'ideal',
  'bcmc',
  'klarna',
  'twint',
  'sepadirectdebit',
  'alipay',
];

const HOLDER_LABELS = ['Seller', 'Franchisee', 'Sub-merchant', 'User'];

/** How the review names each kind when counting them. */
const COUNT_LABELS: Record<NodeKind, string> = {
  company: 'Company account',
  pos: 'In-person merchant accounts',
  ecom: 'Online merchant accounts',
  bp: 'Balance platform',
  store: 'Stores',
  accHolder: 'Account holders',
  liableAccHolder: 'Liable account holder',
  legalEntity: 'Legal entities',
  businessLine: 'Business lines',
  transferInst: 'Bank accounts',
  balanceAcc: 'Balance accounts',
  grantAcc: 'Grant accounts',
  payInstCard: 'Cards',
  payInstBiz: 'Business accounts',
  grantRef: 'Grant offers',
};

function integrationsIn(groups: readonly IntegrationGroupId[]) {
  return INTEGRATION_GROUPS.filter((group) => groups.includes(group.id)).map((group) => ({
    label: group.label,
    options: INTEGRATIONS.filter((entry) => entry.group === group.id).map((entry) => ({
      id: entry.id,
      label: entry.label,
    })),
  }));
}

const ONLINE_INTEGRATIONS = integrationsIn(['online', 'app', 'plugin']);
const IN_PERSON_INTEGRATIONS = integrationsIn(['inperson']);

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

/**
 * A few questions, one screen at a time, and a diagram at the end. Steps for
 * channels that are not used are skipped, and the review counts what will be
 * drawn before anything is replaced.
 */
export function GuidedSetup({ initial = DEFAULT_ANSWERS, onClose, onBuild }: GuidedSetupProps) {
  const [answers, setAnswers] = useState<GuidedAnswers>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = stepsFor(answers);
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 'company';
  const isLast = step === 'review';

  const update = (patch: Partial<GuidedAnswers>): void => setAnswers((current) => ({ ...current, ...patch }));
  const canContinue =
    step === 'channels' ? answers.online || answers.inPerson || answers.platform : step !== 'company' || answers.companyName.trim() !== '';

  const next = (): void => {
    if (!canContinue) return;
    if (isLast) {
      onBuild(buildFromAnswers(answers));
      return;
    }
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  return (
    <Modal
      title="Guided setup"
      description="A few questions about the merchant. You can change everything on the canvas afterwards."
      size="wide"
      onClose={onClose}
    >
      <form
        className={styles.body}
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <ol className={styles.progress} aria-label="Steps">
          {steps.map((id, index) => (
            <li key={id} className={styles.progressItem} data-state={index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo'}>
              <button
                type="button"
                className={styles.progressButton}
                disabled={index > stepIndex}
                onClick={() => setStepIndex(index)}
                aria-current={index === stepIndex ? 'step' : undefined}
              >
                <span className={styles.progressDot}>{index + 1}</span>
                <span className={styles.progressLabel}>{STEP_TITLES[id]}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className={styles.step} key={step}>
          {step === 'company' ? <CompanyStep answers={answers} update={update} /> : null}
          {step === 'channels' ? <ChannelsStep answers={answers} update={update} /> : null}
          {step === 'online' ? <OnlineStep answers={answers} update={update} /> : null}
          {step === 'inPerson' ? <InPersonStep answers={answers} update={update} /> : null}
          {step === 'platform' ? <PlatformStep answers={answers} update={update} /> : null}
          {step === 'review' ? <ReviewStep answers={answers} /> : null}
        </div>

        <div className={styles.actions}>
          <span className={styles.hint}>
            {isLast ? 'This replaces the diagram you have open. Undo brings it back.' : `Step ${stepIndex + 1} of ${steps.length}`}
          </span>
          {stepIndex > 0 ? (
            <button type="button" className={styles.secondary} onClick={() => setStepIndex((index) => index - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.primary} disabled={!canContinue}>
            {isLast ? 'Create diagram' : 'Next'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface StepProps {
  readonly answers: GuidedAnswers;
  readonly update: (patch: Partial<GuidedAnswers>) => void;
}

function CompanyStep({ answers, update }: StepProps) {
  const segments = answers.split === 'single' ? [] : segmentsOf(answers).filter((entry) => entry !== '');
  return (
    <>
      <Field label="Company name">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={answers.companyName}
            maxLength={64}
            autoFocus
            onChange={(event) => update({ companyName: event.target.value })}
          />
        )}
      </Field>
      <Field label="Website" hint="Optional. Used to show the company logo.">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={answers.website}
            placeholder="acme.com"
            onChange={(event) => update({ website: event.target.value })}
          />
        )}
      </Field>
      <Field
        label="Are merchant accounts split by country or brand?"
        hint="Each country or brand gets its own set of merchant accounts."
      >
        {() => (
          <Segmented
            label="Split"
            options={SPLITS}
            value={answers.split}
            onChange={(split) =>
              update({
                split,
                segments:
                  answers.segments.trim() !== '' ? answers.segments : split === 'country' ? 'NL, DE, UK' : 'Brand A, Brand B',
              })
            }
          />
        )}
      </Field>
      {answers.split === 'single' ? null : (
        <Field
          label={answers.split === 'country' ? 'Which countries?' : 'Which brands?'}
          hint={`Separate them with commas, up to ${GUIDED_LIMITS.segments}. ${segments.length} so far.`}
        >
          {(id) => (
            <input
              id={id}
              className={styles.input}
              value={answers.segments}
              onChange={(event) => update({ segments: event.target.value })}
            />
          )}
        </Field>
      )}
    </>
  );
}

function ChannelsStep({ answers, update }: StepProps) {
  return (
    <>
      <p className={styles.question}>Pick everything that applies.</p>
      <div className={styles.tiles}>
        <Tile
          kind="ecom"
          title="Online"
          description="A webshop, app or payment links."
          checked={answers.online}
          onChange={(online) => update({ online })}
        />
        <Tile
          kind="pos"
          title="In person"
          description="Terminals in stores, restaurants or on the go."
          checked={answers.inPerson}
          onChange={(inPerson) => update({ inPerson })}
        />
        <Tile
          kind="bp"
          title="Pays out to others"
          description="Sellers, franchisees or users get their own balance: a balance platform."
          checked={answers.platform}
          onChange={(platform) => update({ platform })}
        />
      </div>
    </>
  );
}

function OnlineStep({ answers, update }: StepProps) {
  const methods = [...new Set([...POPULAR_METHODS, ...answers.methods])];
  return (
    <>
      <Field label="How is it integrated?">
        {() => (
          <div className={styles.groups}>
            {ONLINE_INTEGRATIONS.map((group) => (
              <div key={group.label} className={styles.group}>
                <span className={styles.groupLabel}>{group.label}</span>
                <Chips
                  options={group.options}
                  selected={answers.onlineIntegrations}
                  onToggle={(id) => update({ onlineIntegrations: toggle(answers.onlineIntegrations, id) })}
                />
              </div>
            ))}
          </div>
        )}
      </Field>
      <Field label="Which payment methods?">
        {() => (
          <Chips
            options={methods.map((id) => ({ id, label: methodLabel(id) }))}
            selected={answers.methods}
            onToggle={(id) => update({ methods: toggle(answers.methods, id) })}
          />
        )}
      </Field>
    </>
  );
}

function InPersonStep({ answers, update }: StepProps) {
  return (
    <>
      <Field label="How are the terminals integrated?">
        {() => (
          <Chips
            options={IN_PERSON_INTEGRATIONS.flatMap((group) => group.options)}
            selected={answers.inPersonIntegrations}
            onToggle={(id) => update({ inPersonIntegrations: toggle(answers.inPersonIntegrations, id) })}
          />
        )}
      </Field>
      <div className={styles.row}>
        <Field
          label={answers.split === 'single' ? 'How many stores?' : 'Stores per merchant account'}
          hint="Zero puts the terminals on the merchant account."
        >
          {() => (
            <Stepper
              label="Stores"
              value={answers.storesPerAccount}
              max={GUIDED_LIMITS.storesPerAccount}
              onChange={(storesPerAccount) => update({ storesPerAccount })}
            />
          )}
        </Field>
        <Field label={answers.storesPerAccount === 0 ? 'Terminals' : 'Terminals per store'}>
          {() => (
            <Stepper
              label="Terminals"
              value={answers.terminalsPerStore}
              min={1}
              max={GUIDED_LIMITS.terminalsPerStore}
              onChange={(terminalsPerStore) => update({ terminalsPerStore })}
            />
          )}
        </Field>
      </div>
      <Field label="What kind of terminal?">
        {() => (
          <div className={styles.terminals} role="radiogroup" aria-label="Terminal type">
            {TERMINAL_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="radio"
                aria-checked={answers.terminal === category}
                className={styles.terminal}
                onClick={() => update({ terminal: category })}
              >
                <TerminalIcon name={category} size={22} />
                {terminalLabel(category)}
              </button>
            ))}
          </div>
        )}
      </Field>
      {answers.online ? (
        <Check
          label="Online and in person are the same business"
          hint="Links the two merchant accounts so they read as one."
          checked={answers.linkChannels}
          onChange={(linkChannels) => update({ linkChannels })}
        />
      ) : null}
    </>
  );
}

function PlatformStep({ answers, update }: StepProps) {
  return (
    <>
      <div className={styles.row}>
        <Field label="Who gets paid out?" hint="Each one becomes an account holder.">
          {(id) => (
            <div className={styles.labelPicker}>
              <input
                id={id}
                className={styles.input}
                value={answers.holderLabel}
                maxLength={40}
                onChange={(event) => update({ holderLabel: event.target.value })}
              />
              <Chips
                options={HOLDER_LABELS.map((label) => ({ id: label, label }))}
                selected={[answers.holderLabel]}
                onToggle={(holderLabel) => update({ holderLabel })}
              />
            </div>
          )}
        </Field>
        <Field label="How many to draw?" hint="A few examples are enough.">
          {() => (
            <Stepper
              label="Account holders"
              value={answers.accountHolders}
              max={GUIDED_LIMITS.accountHolders}
              onChange={(accountHolders) => update({ accountHolders })}
            />
          )}
        </Field>
      </div>
      <div className={styles.checks}>
        <Check
          label="Liable account holder"
          hint="The platform's own account, which carries the liability."
          checked={answers.liableHolder}
          onChange={(liableHolder) => update({ liableHolder })}
        />
        <Check
          label="Payouts to a bank account"
          hint="A verified bank account for each of them."
          checked={answers.payouts}
          onChange={(payouts) => update({ payouts })}
        />
        <Check
          label="Issue cards"
          hint="A card on each balance account."
          checked={answers.cards}
          onChange={(cards) => update({ cards })}
        />
        <Check
          label="Business accounts"
          hint="An IBAN-addressable account on each balance account."
          checked={answers.businessAccounts}
          onChange={(businessAccounts) => update({ businessAccounts })}
        />
        <Check
          label="Capital"
          hint="A grant account with an offer, for financing."
          checked={answers.capital}
          onChange={(capital) => update({ capital })}
        />
        {answers.inPerson && answers.storesPerAccount > 0 ? (
          <Check
            label={`Each ${answers.holderLabel.trim().toLowerCase() || 'account holder'} runs one of the stores`}
            hint="Links their business line to their store."
            checked={answers.holdersRunStores}
            onChange={(holdersRunStores) => update({ holdersRunStores })}
          />
        ) : null}
      </div>
    </>
  );
}

function ReviewStep({ answers }: { readonly answers: GuidedAnswers }) {
  const summary = useMemo(() => {
    const doc = buildFromAnswers(answers);
    const counts = new Map<NodeKind, number>();
    forEachNode(doc, (node) => counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1));
    return {
      name: doc.root.name,
      rows: NODE_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({ kind, count: counts.get(kind) ?? 0 })),
      links: collectLinks(doc).length,
    };
  }, [answers]);

  return (
    <>
      <p className={styles.question}>
        Ready to draw <strong>{summary.name}</strong>:
      </p>
      <ul className={styles.summary}>
        {summary.rows.map(({ kind, count }) => {
          const spec = specOf(kind);
          return (
            <li key={kind} className={styles.summaryRow}>
              <span className={styles.summaryIcon} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
                <Icon name={spec.icon} tint={spec.tint} size={14} />
              </span>
              <span className={styles.summaryLabel}>{COUNT_LABELS[kind]}</span>
              <span className={styles.summaryCount}>{count}</span>
            </li>
          );
        })}
        {summary.links > 0 ? (
          <li className={styles.summaryRow}>
            <span className={styles.summaryIcon}>
              <svg className={styles.linkGlyph} viewBox="0 0 24 24" aria-hidden>
                <path d="M10 7H7a5 5 0 0 0 0 10h3M14 7h3a5 5 0 0 1 0 10h-3M8 12h8" />
              </svg>
            </span>
            <span className={styles.summaryLabel}>Links</span>
            <span className={styles.summaryCount}>{summary.links}</span>
          </li>
        ) : null}
      </ul>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segmentedOption"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  return (
    <div className={styles.chips}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={styles.chip}
          aria-pressed={selected.includes(option.id)}
          onClick={() => onToggle(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.stepperButton}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label={`Fewer ${label.toLowerCase()}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 12h12" />
        </svg>
      </button>
      <output className={styles.stepperValue} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={styles.stepperButton}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`More ${label.toLowerCase()}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 6v12M6 12h12" />
        </svg>
      </button>
    </div>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={styles.checkText}>
        <span className={styles.checkLabel}>{label}</span>
        <span className={styles.fieldHint}>{hint}</span>
      </span>
    </label>
  );
}

function Tile({
  kind,
  title,
  description,
  checked,
  onChange,
}: {
  readonly kind: NodeKind;
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const spec = specOf(kind);
  return (
    <button type="button" className={styles.tile} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className={styles.tileTop}>
        <span className={styles.tileIcon} style={{ background: `var(--tint-${spec.tint}-fill)` }}>
          <Icon name={spec.icon} tint={spec.tint} size={18} />
        </span>
        <span className={styles.tileCheck} aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M6 12.5l4 4 8-9" />
          </svg>
        </span>
      </span>
      <span className={styles.tileTitle}>{title}</span>
      <span className={styles.tileDescription}>{description}</span>
    </button>
  );
}
