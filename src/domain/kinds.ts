/**
 * The single source of truth for what a node is and what it may do.
 *
 * In the previous version this knowledge was spread across `generateNodeHTML`,
 * `jsonToDOM`, `addChildNode`, `applyNodeType`, `updateChildrenVisibility`,
 * `toggleNodeType` and `dragStart`, each with its own copy of the captions and
 * the allowed-child rules. Everything now derives from `NODE_SPECS`.
 */

import type { IconName } from '../design/icons';
import type { TintName } from '../design/palette';

export const NODE_KINDS = [
  'company',
  'pos',
  'ecom',
  'bp',
  'store',
  'accHolder',
  'liableAccHolder',
  'legalEntity',
  'businessLine',
  'transferInst',
  'balanceAcc',
  'grantAcc',
  'payInstCard',
  'payInstBiz',
  'grantRef',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const TERMINAL_KINDS = ['counter', 'mobile', 'reader', 'unattended'] as const;
export type TerminalKind = (typeof TERMINAL_KINDS)[number];

export const TERMINAL_LABELS: Record<TerminalKind, string> = {
  counter: 'Countertop',
  mobile: 'Mobile',
  reader: 'Tap to Pay',
  unattended: 'Unattended',
};

/**
 * `management` nodes describe the legal/organisational side of the platform and
 * stay visually neutral even when they sit inside a balance platform subtree.
 */
export type NodeTone = 'root' | 'account' | 'management';

export interface VariantGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly { readonly kind: NodeKind; readonly label: string }[];
}

export const VARIANT_GROUPS = {
  merchant: {
    id: 'merchant',
    label: 'Account type',
    options: [
      { kind: 'pos', label: 'POS' },
      { kind: 'ecom', label: 'Ecom' },
      { kind: 'bp', label: 'Balance platform' },
    ],
  },
  holder: {
    id: 'holder',
    label: 'Liability',
    options: [
      { kind: 'accHolder', label: 'Standard' },
      { kind: 'liableAccHolder', label: 'Liable' },
    ],
  },
  account: {
    id: 'account',
    label: 'Account type',
    options: [
      { kind: 'balanceAcc', label: 'Balance' },
      { kind: 'grantAcc', label: 'Grant' },
    ],
  },
  instrument: {
    id: 'instrument',
    label: 'Instrument',
    options: [
      { kind: 'payInstCard', label: 'Card' },
      { kind: 'payInstBiz', label: 'Business account' },
    ],
  },
  legalEntityChild: {
    id: 'legalEntityChild',
    label: 'Type',
    options: [
      { kind: 'businessLine', label: 'Business line' },
      { kind: 'transferInst', label: 'External bank account' },
    ],
  },
} as const satisfies Record<string, VariantGroup>;

export type VariantGroupId = keyof typeof VARIANT_GROUPS;

export interface NodeKindSpec {
  readonly kind: NodeKind;
  /** Name applied to a freshly created node. */
  readonly defaultName: string;
  /** Secondary line on the card. */
  readonly caption: string;
  readonly icon: IconName;
  readonly tint: TintName;
  readonly tone: NodeTone;
  /** Allowed child kinds, in menu order. The first entry is what `+` creates. */
  readonly childKinds: readonly NodeKind[];
  /** Caps on how many children of a kind may exist under this node. */
  readonly childLimits: Readonly<Partial<Record<NodeKind, number>>>;
  /** Which switch to show in the inspector, if the kind can be changed. */
  readonly variantGroup: VariantGroupId | null;
  readonly supportsTerminals: boolean;
  /** Integration types (web, mobile, partner plugin, …) can be listed. */
  readonly supportsIntegrations: boolean;
  /** Payment methods can be listed. */
  readonly supportsMethods: boolean;
  /**
   * Drawn without a connector to its parent. A balance platform is reached
   * through links from merchant accounts, not through account ownership, so a
   * line to the company account would state a relationship that does not exist.
   */
  readonly detached: boolean;
  /** A logo can stand in for the icon, keyed by company domain. */
  readonly supportsLogo: boolean;
  /** The root node cannot be deleted, moved or re-typed. */
  readonly isRoot: boolean;
  /** One-line explanation surfaced in the inspector. */
  readonly description: string;
}

type SpecDefaults =
  | 'childKinds'
  | 'childLimits'
  | 'variantGroup'
  | 'supportsTerminals'
  | 'supportsIntegrations'
  | 'supportsMethods'
  | 'supportsLogo'
  | 'detached'
  | 'isRoot';

function spec(
  kind: NodeKind,
  values: Omit<NodeKindSpec, 'kind' | SpecDefaults> & Partial<Pick<NodeKindSpec, SpecDefaults>>,
): NodeKindSpec {
  return {
    kind,
    childKinds: [],
    childLimits: {},
    variantGroup: null,
    supportsTerminals: false,
    supportsIntegrations: false,
    supportsMethods: false,
    supportsLogo: false,
    detached: false,
    isRoot: false,
    ...values,
  };
}

export const NODE_SPECS: Record<NodeKind, NodeKindSpec> = {
  company: spec('company', {
    defaultName: 'My Company',
    caption: 'Company account',
    icon: 'company',
    tint: 'blue',
    tone: 'root',
    childKinds: ['pos', 'ecom', 'bp'],
    isRoot: true,
    supportsLogo: true,
    description: 'The top-level company account that owns every merchant account below it.',
  }),
  pos: spec('pos', {
    defaultName: 'POS',
    caption: 'Merchant account',
    icon: 'pos',
    tint: 'orange',
    tone: 'account',
    childKinds: ['store'],
    variantGroup: 'merchant',
    supportsTerminals: true,
    supportsIntegrations: true,
    supportsMethods: true,
    supportsLogo: true,
    description: 'In-person merchant account. Add its integrations, or stores that group terminals by location.',
  }),
  ecom: spec('ecom', {
    defaultName: 'Ecom',
    caption: 'Merchant account',
    icon: 'ecom',
    tint: 'blue',
    tone: 'account',
    variantGroup: 'merchant',
    supportsIntegrations: true,
    supportsMethods: true,
    supportsLogo: true,
    description: 'Online merchant account. Ecom traffic is not split into stores.',
  }),
  bp: spec('bp', {
    defaultName: 'Balance Platform',
    caption: 'Balance platform',
    icon: 'bp',
    tint: 'green',
    tone: 'account',
    childKinds: ['liableAccHolder', 'accHolder'],
    childLimits: { liableAccHolder: 1 },
    variantGroup: 'merchant',
    supportsIntegrations: true,
    supportsLogo: true,
    detached: true,
    description:
      'Holds the account holders, balance accounts and instruments. Merchant accounts link to it rather than own it.',
  }),
  store: spec('store', {
    defaultName: 'Store',
    caption: 'Store',
    icon: 'store',
    tint: 'orange',
    tone: 'account',
    supportsTerminals: true,
    supportsMethods: true,
    description: 'A physical location under a POS merchant account. Add the terminals it runs.',
  }),
  accHolder: spec('accHolder', {
    defaultName: 'Account Holder',
    caption: 'Account holder',
    icon: 'accHolder',
    tint: 'blue',
    tone: 'account',
    childKinds: ['balanceAcc', 'grantAcc', 'legalEntity'],
    childLimits: { legalEntity: 1 },
    variantGroup: 'holder',
    description: 'A user of the platform. Owns balance accounts and exactly one legal entity.',
  }),
  liableAccHolder: spec('liableAccHolder', {
    defaultName: 'Liable Account Holder',
    caption: 'Liable account holder',
    icon: 'liableAccHolder',
    tint: 'blue',
    tone: 'account',
    childKinds: ['balanceAcc', 'grantAcc', 'legalEntity'],
    childLimits: { legalEntity: 1 },
    variantGroup: 'holder',
    description: 'The account holder that carries liability for the platform.',
  }),
  legalEntity: spec('legalEntity', {
    defaultName: 'Legal Entity',
    caption: 'Legal entity',
    icon: 'legalEntity',
    tint: 'grey',
    tone: 'management',
    childKinds: ['businessLine', 'transferInst'],
    description: 'The verified organisation or individual behind an account holder.',
  }),
  businessLine: spec('businessLine', {
    defaultName: 'Business Line',
    caption: 'Business line',
    icon: 'businessLine',
    tint: 'grey',
    tone: 'management',
    variantGroup: 'legalEntityChild',
    description: 'A product or service of the legal entity. Link it to the stores it serves.',
  }),
  transferInst: spec('transferInst', {
    defaultName: 'Transfer Instrument',
    caption: 'External bank account',
    icon: 'transferInst',
    tint: 'grey',
    tone: 'management',
    variantGroup: 'legalEntityChild',
    description: 'A verified external bank account used to pay out to the legal entity.',
  }),
  balanceAcc: spec('balanceAcc', {
    defaultName: 'Balance Account',
    caption: 'Balance account',
    icon: 'balanceAcc',
    tint: 'green',
    tone: 'account',
    childKinds: ['payInstCard', 'payInstBiz'],
    variantGroup: 'account',
    description: 'Holds funds for an account holder and issues payment instruments.',
  }),
  grantAcc: spec('grantAcc', {
    defaultName: 'Grant Account',
    caption: 'Grant account',
    icon: 'grantAcc',
    tint: 'green',
    tone: 'account',
    childKinds: ['grantRef'],
    variantGroup: 'account',
    description: 'Tracks capital offered to an account holder through grant references.',
  }),
  payInstCard: spec('payInstCard', {
    defaultName: 'Card',
    caption: 'Adyen-issued card',
    icon: 'payInstCard',
    tint: 'orange',
    tone: 'account',
    variantGroup: 'instrument',
    description: 'A physical or virtual card issued against the balance account.',
  }),
  payInstBiz: spec('payInstBiz', {
    defaultName: 'Business Account',
    caption: 'Business account',
    icon: 'payInstBiz',
    tint: 'green',
    tone: 'account',
    variantGroup: 'instrument',
    description: 'An IBAN-addressable business account on top of the balance account.',
  }),
  grantRef: spec('grantRef', {
    defaultName: 'Grant Reference',
    caption: 'Grant reference',
    icon: 'grantRef',
    tint: 'grey',
    tone: 'account',
    description: 'A single capital offer drawn from the grant account.',
  }),
};

export const DEFAULT_NAMES: ReadonlySet<string> = new Set(
  NODE_KINDS.map((kind) => NODE_SPECS[kind].defaultName),
);

export function specOf(kind: NodeKind): NodeKindSpec {
  return NODE_SPECS[kind];
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && (NODE_KINDS as readonly string[]).includes(value);
}

export function isTerminalKind(value: unknown): value is TerminalKind {
  return typeof value === 'string' && (TERMINAL_KINDS as readonly string[]).includes(value);
}

/**
 * Caption shown under the name. A balance account inherits the liability of its
 * holder, which is why the parent is part of the signature: the old code kept a
 * separate `liableBalanceAcc` kind in sync by hand instead.
 */
export function captionFor(kind: NodeKind, parentKind: NodeKind | null): string {
  if (kind === 'balanceAcc' && parentKind === 'liableAccHolder') return 'Liable balance account';
  return NODE_SPECS[kind].caption;
}

export function variantGroupOf(kind: NodeKind): VariantGroup | null {
  const id = NODE_SPECS[kind].variantGroup;
  return id === null ? null : VARIANT_GROUPS[id];
}

/** The kind produced when the icon is clicked: the next option in the group. */
export function nextVariant(kind: NodeKind): NodeKind | null {
  const group = variantGroupOf(kind);
  if (!group) return null;
  const index = group.options.findIndex((option) => option.kind === kind);
  if (index === -1) return null;
  const next = group.options[(index + 1) % group.options.length];
  return next ? next.kind : null;
}

/** The kind produced by stepping backwards through the variant group. */
export function prevVariant(kind: NodeKind): NodeKind | null {
  const group = variantGroupOf(kind);
  if (!group) return null;
  const index = group.options.findIndex((option) => option.kind === kind);
  if (index === -1) return null;
  const previous = group.options[(index - 1 + group.options.length) % group.options.length];
  return previous ? previous.kind : null;
}

export function canContain(parent: NodeKind, child: NodeKind): boolean {
  return NODE_SPECS[parent].childKinds.includes(child);
}

/**
 * Cross-links that may exist between nodes in different branches, written as
 * `[owner, target]`. The owner side is the one that stores the link, which
 * keeps a pair from being serialised, drawn or deleted twice.
 */
export const LINK_RULES = [
  ['businessLine', 'store'],
  ['pos', 'pos'],
  ['pos', 'ecom'],
  ['pos', 'bp'],
  ['ecom', 'ecom'],
  ['ecom', 'bp'],
] as const satisfies readonly (readonly [NodeKind, NodeKind])[];

/**
 * How many links of a target kind one owner may hold.
 *
 * Merchant account to balance platform is many-to-one: several merchant
 * accounts can feed the same platform, but a merchant account belongs to one
 * platform. The cap therefore sits on the merchant (owner) side, and nothing
 * limits how many merchant accounts a platform receives.
 */
export const LINK_LIMITS: readonly {
  readonly owner: NodeKind;
  readonly target: NodeKind;
  readonly max: number;
}[] = [
  { owner: 'pos', target: 'bp', max: 1 },
  { owner: 'ecom', target: 'bp', max: 1 },
];

export function linkLimit(owner: NodeKind, target: NodeKind): number | null {
  return LINK_LIMITS.find((rule) => rule.owner === owner && rule.target === target)?.max ?? null;
}

export function canLink(a: NodeKind, b: NodeKind): boolean {
  return LINK_RULES.some(([owner, target]) => (owner === a && target === b) || (owner === b && target === a));
}

/** Kinds that `kind` may be linked to, for drag targeting and the inspector. */
export function linkableKinds(kind: NodeKind): NodeKind[] {
  const result = new Set<NodeKind>();
  for (const [owner, target] of LINK_RULES) {
    if (owner === kind) result.add(target);
    if (target === kind) result.add(owner);
  }
  return [...result];
}

/**
 * Which endpoint stores a link. Rule order decides it; when a rule is symmetric
 * (both endpoints the same kind) the lower id wins so the choice is stable.
 */
export function linkOwnerId(
  aId: string,
  aKind: NodeKind,
  bId: string,
  bKind: NodeKind,
): { ownerId: string; targetId: string } | null {
  if (!canLink(aKind, bKind)) return null;
  const aOwns = LINK_RULES.some(([owner, target]) => owner === aKind && target === bKind);
  const bOwns = LINK_RULES.some(([owner, target]) => owner === bKind && target === aKind);
  if (aOwns && !bOwns) return { ownerId: aId, targetId: bId };
  if (bOwns && !aOwns) return { ownerId: bId, targetId: aId };
  return aId <= bId ? { ownerId: aId, targetId: bId } : { ownerId: bId, targetId: aId };
}

/** Stable key for an unordered pair of ids. */
export function linkKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}
