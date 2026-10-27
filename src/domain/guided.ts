/**
 * The guided setup: a handful of answers about a merchant, turned into a
 * diagram. Templates are stored as answers too, so every template can be
 * opened in the guided setup and adjusted from there.
 *
 * The builder writes the same authoring JSON the Build prompt asks a model for
 * and hands it to `normalizeDocument`, so nesting rules, limits and link
 * cardinality are enforced in one place rather than re-implemented here.
 */

import type { StructureDocument } from './document';
import type { TerminalCategory } from './kinds';
import { normalizeDocument, type RawNode } from './normalize';
import { MAX_NAME_LENGTH } from './operations';

export type AccountSplit = 'single' | 'country' | 'brand';

export interface GuidedAnswers {
  readonly companyName: string;
  /** Used to look up the company logo. Empty when unknown. */
  readonly website: string;
  /** Whether merchant accounts are repeated per country or brand. */
  readonly split: AccountSplit;
  /** Countries or brands, comma separated. Ignored when `split` is single. */
  readonly segments: string;

  readonly online: boolean;
  readonly onlineIntegrations: readonly string[];
  readonly methods: readonly string[];

  readonly inPerson: boolean;
  readonly inPersonIntegrations: readonly string[];
  readonly storesPerAccount: number;
  readonly terminal: TerminalCategory;
  readonly terminalsPerStore: number;
  /** Links the in-person and online account of the same business. */
  readonly linkChannels: boolean;

  readonly platform: boolean;
  /** What the platform's users are called: sellers, franchisees, … */
  readonly holderLabel: string;
  readonly accountHolders: number;
  readonly liableHolder: boolean;
  /** A verified bank account per user, to pay out to. */
  readonly payouts: boolean;
  readonly cards: boolean;
  readonly businessAccounts: boolean;
  readonly capital: boolean;
  /** Each user runs one of the stores: their business line links to it. */
  readonly holdersRunStores: boolean;
}

export const GUIDED_LIMITS = {
  segments: 8,
  storesPerAccount: 12,
  terminalsPerStore: 5,
  accountHolders: 10,
} as const;

export const DEFAULT_ANSWERS: GuidedAnswers = {
  companyName: 'Acme Group',
  website: '',
  split: 'single',
  segments: '',
  online: true,
  onlineIntegrations: ['webDropin'],
  methods: ['visa', 'mc', 'applepay', 'googlepay'],
  inPerson: false,
  inPersonIntegrations: ['terminalApiCloud'],
  storesPerAccount: 2,
  terminal: 'counter',
  terminalsPerStore: 1,
  linkChannels: true,
  platform: false,
  holderLabel: 'Seller',
  accountHolders: 2,
  liableHolder: true,
  payouts: true,
  cards: false,
  businessAccounts: false,
  capital: false,
  holdersRunStores: false,
};

function clampCount(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/** Names longer than a card allows are cut rather than rejected. */
function name(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** The countries or brands the merchant accounts repeat for, or one empty entry. */
export function segmentsOf(answers: GuidedAnswers): readonly string[] {
  if (answers.split === 'single') return [''];
  const list = [
    ...new Set(
      answers.segments
        .split(/[,;\n]/)
        .map((entry) => name(entry))
        .filter((entry) => entry !== ''),
    ),
  ].slice(0, GUIDED_LIMITS.segments);
  return list.length > 0 ? list : [''];
}

function accountName(company: string, split: AccountSplit, segment: string, channel: string): string {
  if (segment === '') return name(`${company} ${channel}`);
  return name(split === 'brand' ? `${segment} ${channel}` : `${company} ${segment} ${channel}`);
}

function repeat<T>(count: number, make: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

export function buildFromAnswers(answers: GuidedAnswers): StructureDocument {
  const company = name(answers.companyName) || 'My Company';
  const segments = segmentsOf(answers);
  const stores = clampCount(answers.storesPerAccount, GUIDED_LIMITS.storesPerAccount);
  const terminalCount = Math.max(1, clampCount(answers.terminalsPerStore, GUIDED_LIMITS.terminalsPerStore));
  const terminals = repeat(terminalCount, () => answers.terminal);
  const holders = answers.platform ? clampCount(answers.accountHolders, GUIDED_LIMITS.accountHolders) : 0;
  const label = name(answers.holderLabel) || 'Account holder';
  const platformId = 'platform';

  const storeIds: string[] = [];
  const children: RawNode[] = [];

  segments.forEach((segment, segmentIndex) => {
    const ecomId = `ecom-${segmentIndex}`;
    const both = answers.online && answers.inPerson;

    if (answers.inPerson) {
      const storeNodes = repeat(stores, (index) => {
        const id = `store-${segmentIndex}-${index}`;
        storeIds.push(id);
        return {
          id,
          kind: 'store',
          name: name(segment === '' ? `Store ${index + 1}` : `${segment} Store ${index + 1}`),
          terminals,
        };
      });
      children.push({
        kind: 'pos',
        name: accountName(company, answers.split, segment, 'Stores'),
        integrations: answers.inPersonIntegrations.map((id) => ({ id })),
        // Without stores the terminals sit on the merchant account itself.
        terminals: stores === 0 ? terminals : [],
        children: storeNodes,
        links: [
          ...(answers.platform ? [platformId] : []),
          ...(both && answers.linkChannels ? [ecomId] : []),
        ],
      });
    }

    if (answers.online) {
      children.push({
        id: ecomId,
        kind: 'ecom',
        name: accountName(company, answers.split, segment, 'Online'),
        integrations: answers.onlineIntegrations.map((id) => ({ id })),
        methods: answers.methods,
        links: answers.platform ? [platformId] : [],
      });
    }
  });

  if (answers.platform) {
    const balance = (title: string): RawNode => ({
      kind: 'balanceAcc',
      name: title,
      children: [
        ...(answers.cards ? [{ kind: 'payInstCard', name: 'Card' }] : []),
        ...(answers.businessAccounts ? [{ kind: 'payInstBiz', name: 'Business account' }] : []),
      ],
    });

    const holderNodes: RawNode[] = repeat(holders, (index) => {
      const holderName = name(`${label} ${index + 1}`);
      const storeId = answers.inPerson && answers.holdersRunStores ? storeIds[index] : undefined;
      return {
        kind: 'accHolder',
        name: holderName,
        children: [
          balance('Balance account'),
          ...(answers.capital
            ? [{ kind: 'grantAcc', name: 'Capital', children: [{ kind: 'grantRef', name: 'Grant offer' }] }]
            : []),
          {
            kind: 'legalEntity',
            name: holderName,
            children: [
              { kind: 'businessLine', name: 'Business line', links: storeId === undefined ? [] : [storeId] },
              ...(answers.payouts ? [{ kind: 'transferInst', name: 'Bank account' }] : []),
            ],
          },
        ],
      };
    });

    children.push({
      id: platformId,
      kind: 'bp',
      name: name(`${company} Platform`),
      integrations: [
        { id: 'platforms' },
        ...(answers.cards ? [{ id: 'issuing' }] : []),
        ...(answers.capital ? [{ id: 'capital' }] : []),
      ],
      children: [
        ...(answers.liableHolder
          ? [
              {
                kind: 'liableAccHolder',
                name: company,
                children: [
                  balance('Liable balance account'),
                  {
                    kind: 'legalEntity',
                    name: company,
                    children: answers.payouts ? [{ kind: 'transferInst', name: 'Bank account' }] : [],
                  },
                ],
              },
            ]
          : []),
        ...holderNodes,
      ],
    });
  }

  return normalizeDocument({
    root: { kind: 'company', name: company, logoDomain: answers.website, children },
  });
}
