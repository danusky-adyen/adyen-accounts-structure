/**
 * Ready-made starting points for the setups that come up most. Each one is a
 * set of guided-setup answers, so opening a template in the guided setup shows
 * exactly the choices it was made from.
 */

import { DEFAULT_ANSWERS, type GuidedAnswers } from './guided';
import type { NodeKind } from './kinds';

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The account types it shows off, for the icons on its tile. */
  readonly highlights: readonly NodeKind[];
  readonly answers: GuidedAnswers;
}

function answers(overrides: Partial<GuidedAnswers>): GuidedAnswers {
  return { ...DEFAULT_ANSWERS, ...overrides };
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'webshop',
    name: 'Webshop',
    description: 'One online merchant account with Drop-in and the usual cards and wallets.',
    highlights: ['ecom'],
    answers: answers({
      companyName: 'Acme Shop',
      onlineIntegrations: ['webDropin'],
      methods: ['visa', 'mc', 'amex', 'applepay', 'googlepay', 'paypal', 'klarna'],
    }),
  },
  {
    id: 'retail',
    name: 'Retail chain',
    description: 'In-person payments across four stores, each with countertop terminals.',
    highlights: ['pos', 'store'],
    answers: answers({
      companyName: 'Acme Retail',
      online: false,
      inPerson: true,
      inPersonIntegrations: ['terminalApiCloud'],
      storesPerAccount: 4,
      terminal: 'counter',
      terminalsPerStore: 2,
    }),
  },
  {
    id: 'omnichannel',
    name: 'Omnichannel retailer',
    description: 'A webshop and stores for the same business, linked so they read as one.',
    highlights: ['ecom', 'pos', 'store'],
    answers: answers({
      companyName: 'Acme Fashion',
      inPerson: true,
      storesPerAccount: 3,
      terminal: 'counter',
      linkChannels: true,
      methods: ['visa', 'mc', 'applepay', 'googlepay', 'klarna'],
    }),
  },
  {
    id: 'international',
    name: 'International',
    description: 'Online and in-person merchant accounts repeated per country.',
    highlights: ['ecom', 'pos'],
    answers: answers({
      companyName: 'Acme Europe',
      split: 'country',
      segments: 'NL, DE, UK',
      inPerson: true,
      storesPerAccount: 2,
      methods: ['visa', 'mc', 'applepay', 'googlepay', 'ideal', 'klarna'],
    }),
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    description: 'An online marketplace paying out to its sellers through a balance platform.',
    highlights: ['ecom', 'bp', 'accHolder'],
    answers: answers({
      companyName: 'Acme Market',
      onlineIntegrations: ['webDropin'],
      platform: true,
      holderLabel: 'Seller',
      accountHolders: 3,
      payouts: true,
    }),
  },
  {
    id: 'franchise',
    name: 'Franchise',
    description: 'Stores run by franchisees, each paid out from the platform for their own store.',
    highlights: ['pos', 'store', 'bp', 'accHolder'],
    answers: answers({
      companyName: 'Acme Coffee',
      online: false,
      inPerson: true,
      storesPerAccount: 3,
      terminal: 'mobile',
      platform: true,
      holderLabel: 'Franchisee',
      accountHolders: 3,
      payouts: true,
      holdersRunStores: true,
    }),
  },
  {
    id: 'embedded',
    name: 'Embedded finance',
    description: 'A software platform offering its users payments, cards, business accounts and capital.',
    highlights: ['bp', 'accHolder', 'balanceAcc', 'payInstCard'],
    answers: answers({
      companyName: 'Acme Software',
      inPerson: true,
      storesPerAccount: 0,
      terminal: 'reader',
      inPersonIntegrations: ['tapToPay'],
      linkChannels: false,
      platform: true,
      holderLabel: 'User',
      accountHolders: 2,
      cards: true,
      businessAccounts: true,
      capital: true,
    }),
  },
];
