/**
 * What each level of an Adyen account structure is for, in plain words: the
 * text behind Explain mode. Written from docs.adyen.com (account structure,
 * point-of-sale account setup, payouts, platforms) and kept to what holds for
 * most setups, so it explains rather than specifies.
 */

import type { NodeKind } from './kinds';

/** Picks the icon and colour of a point; the words carry the meaning. */
export type ExplainTopic =
  | 'reports'
  | 'methods'
  | 'payout'
  | 'funds'
  | 'bank'
  | 'risk'
  | 'users'
  | 'verify'
  | 'invoice'
  | 'settings'
  | 'developer'
  | 'terminal'
  | 'store'
  | 'online'
  | 'link'
  | 'card'
  | 'capital'
  | 'industry';

export interface ExplainPoint {
  readonly topic: ExplainTopic;
  /** A few words, shown in bold. */
  readonly title: string;
  readonly text: string;
}

export interface Explanation {
  readonly summary: string;
  readonly points: readonly ExplainPoint[];
}

const MERCHANT_METHODS: ExplainPoint = {
  topic: 'methods',
  title: 'Payment methods',
  text: 'Cards, wallets and local methods are switched on here, together with the currencies it processes.',
};

const MERCHANT_PAYOUT: ExplainPoint = {
  topic: 'payout',
  title: 'Payouts',
  text: 'Adyen pays out per merchant account, to one bank account per settlement currency, on the payout schedule set here. Linked to a balance platform, the funds settle into a balance account instead.',
};

const MERCHANT_REPORTS: ExplainPoint = {
  topic: 'reports',
  title: 'Reconciliation reports',
  text: 'The Settlement details and Payment accounting reports are generated per merchant account.',
};

const MERCHANT_RISK: ExplainPoint = {
  topic: 'risk',
  title: 'Risk rules',
  text: 'Can override the risk and 3D Secure rules it inherits from the company account.',
};

export const EXPLANATIONS: Record<NodeKind, Explanation> = {
  company: {
    summary: 'The top of the structure: one per business. Everything below inherits from it.',
    points: [
      {
        topic: 'users',
        title: 'Users and roles',
        text: 'Customer Area users are created here and given access to all merchant accounts or only some.',
      },
      {
        topic: 'invoice',
        title: 'Monthly invoice',
        text: 'Adyen invoices the company account. A merchant account under a different legal entity gets its own invoice.',
      },
      {
        topic: 'risk',
        title: 'Risk rules',
        text: 'RevenueProtect and Dynamic 3D Secure rules are set here, and merchant accounts can override them.',
      },
      {
        topic: 'settings',
        title: 'Default settings',
        text: 'Account and terminal settings set here apply to every merchant account, store and terminal below.',
      },
      {
        topic: 'developer',
        title: 'API credentials and webhooks',
        text: 'Can be created at this level to cover all merchant accounts at once.',
      },
      {
        topic: 'reports',
        title: 'Company-wide reports',
        text: 'Reports such as Payment accounting can be generated across all merchant accounts.',
      },
    ],
  },

  pos: {
    summary: 'A merchant account for in-person payments, usually one per country or brand.',
    points: [
      {
        topic: 'terminal',
        title: 'Terminals',
        text: 'Payment terminals are assigned here or to its stores, in the country the account is set up for.',
      },
      MERCHANT_METHODS,
      MERCHANT_PAYOUT,
      MERCHANT_REPORTS,
      {
        topic: 'settings',
        title: 'Terminal settings',
        text: 'Override the company defaults and pass down to every store and terminal below.',
      },
      MERCHANT_RISK,
    ],
  },

  ecom: {
    summary: 'A merchant account for online payments: web, app and Pay by Link.',
    points: [
      {
        topic: 'online',
        title: 'Online checkout',
        text: 'Your checkout names this merchant account in every payment request. Online traffic is not split into stores.',
      },
      MERCHANT_METHODS,
      MERCHANT_PAYOUT,
      MERCHANT_REPORTS,
      MERCHANT_RISK,
    ],
  },

  bp: {
    summary: "Adyen's platform for holding and moving money: balances, payouts, cards and capital.",
    points: [
      {
        topic: 'funds',
        title: 'Settled funds',
        text: 'Payments from linked merchant accounts settle here after fees, into the balance account set for each merchant account.',
      },
      {
        topic: 'payout',
        title: 'Payouts',
        text: 'Money leaves from balance accounts to verified bank accounts, on a schedule or on demand.',
      },
      {
        topic: 'verify',
        title: 'Onboarding and KYC',
        text: 'Account holders and the legal entities behind them are onboarded and verified here.',
      },
      {
        topic: 'reports',
        title: 'Balance platform reports',
        text: 'Balance and accounting reports cover every balance account on the platform.',
      },
      {
        topic: 'developer',
        title: 'Own credentials and webhooks',
        text: 'Platform API credentials and webhooks, such as transfer and balance events, are set up separately.',
      },
    ],
  },

  store: {
    summary: 'A physical location under a POS merchant account, identified by a store ID.',
    points: [
      {
        topic: 'terminal',
        title: 'Terminals',
        text: 'Each terminal is assigned to the store it is used in.',
      },
      {
        topic: 'settings',
        title: 'Store settings',
        text: 'Terminal settings set here, such as receipts or tipping, override those of the merchant account.',
      },
      {
        topic: 'methods',
        title: 'Payment methods',
        text: 'Can differ per store when one location should accept other methods than the rest.',
      },
      {
        topic: 'reports',
        title: 'Reporting',
        text: 'Every transaction carries its store, so reports can be broken down by location.',
      },
      {
        topic: 'payout',
        title: 'No payout of its own',
        text: 'Payouts still happen per merchant account. A store that needs its own bank transfer needs its own merchant account.',
      },
      {
        topic: 'link',
        title: 'Business line',
        text: 'On a platform, a store is linked to the business line it sells for.',
      },
    ],
  },

  accHolder: {
    summary: 'A user of the platform: the business or person whose money it holds.',
    points: [
      {
        topic: 'verify',
        title: 'Capabilities',
        text: 'Receiving payments, paying out and issuing cards are capabilities granted once its legal entity is verified.',
      },
      {
        topic: 'funds',
        title: 'Balance accounts',
        text: 'Owns one or more balance accounts, for example one per currency or per purpose.',
      },
      {
        topic: 'bank',
        title: 'Where payouts go',
        text: 'Payouts go to a verified bank account (transfer instrument) of its legal entity.',
      },
      {
        topic: 'users',
        title: 'One legal entity',
        text: 'Exactly one legal entity sits behind it and carries the verification.',
      },
    ],
  },

  liableAccHolder: {
    summary: "The platform's own account holder: the platform itself rather than one of its users.",
    points: [
      {
        topic: 'funds',
        title: 'Platform earnings',
        text: 'Commissions and fees, split off payments, are booked to its liable balance account.',
      },
      {
        topic: 'risk',
        title: 'Covers negative balances',
        text: "When a user's balance stays negative, Adyen moves funds from the liable account to cover it.",
      },
      {
        topic: 'invoice',
        title: 'Transaction fees',
        text: 'Split instructions can book payment fees here instead of to the user.',
      },
      {
        topic: 'settings',
        title: 'One per platform',
        text: 'Every balance platform has exactly one.',
      },
    ],
  },

  legalEntity: {
    summary: 'The verified organisation, individual or sole proprietorship behind an account holder.',
    points: [
      {
        topic: 'verify',
        title: 'KYC',
        text: 'Identity, ownership and company details are checked here, for example through hosted onboarding.',
      },
      {
        topic: 'users',
        title: 'People involved',
        text: 'Owners, directors and signatories are legal entities too, associated with this one.',
      },
      {
        topic: 'industry',
        title: 'Business lines',
        text: 'Declares what it sells and how, one business line at a time.',
      },
      {
        topic: 'bank',
        title: 'Bank accounts',
        text: 'Owns the external bank accounts that payouts go to.',
      },
    ],
  },

  businessLine: {
    summary: 'What the legal entity sells and through which channel, for example retail in person.',
    points: [
      {
        topic: 'industry',
        title: 'Industry and sales channels',
        text: 'The industry code and the channels it sells through (in person, online, Pay by Link) are declared here.',
      },
      {
        topic: 'verify',
        title: 'Verified',
        text: 'Adyen checks it, for example the website for online sales, before payments can be processed.',
      },
      {
        topic: 'methods',
        title: 'Payment methods',
        text: 'On a platform, payment methods are requested per business line, optionally narrowed to stores.',
      },
      {
        topic: 'store',
        title: 'Stores',
        text: 'Stores are linked to the business line they sell for.',
      },
    ],
  },

  transferInst: {
    summary: 'A bank account outside Adyen, owned by the legal entity.',
    points: [
      {
        topic: 'verify',
        title: 'Ownership verified',
        text: 'Adyen checks that the account exists and belongs to the legal entity before money can go to it.',
      },
      {
        topic: 'payout',
        title: 'Payout destination',
        text: 'Receives payouts from balance accounts, on a schedule or on demand.',
      },
      {
        topic: 'funds',
        title: 'Top-ups',
        text: 'Can also fund a balance account, for example to clear a negative balance.',
      },
    ],
  },

  balanceAcc: {
    summary: 'Holds money at Adyen for an account holder, in one main currency.',
    points: [
      {
        topic: 'funds',
        title: 'Incoming funds',
        text: 'Receives settled payments and split amounts, and holds them until they move on.',
      },
      {
        topic: 'payout',
        title: 'Payout schedule',
        text: 'Sweeps set here pay out automatically, on a schedule or above a balance. On-demand payouts work too.',
      },
      {
        topic: 'card',
        title: 'Payment instruments',
        text: 'Adyen cards and business accounts spend from it or receive into it.',
      },
      {
        topic: 'reports',
        title: 'Reports',
        text: 'Balance and accounting reports show every transfer in and out.',
      },
    ],
  },

  grantAcc: {
    summary: 'Tracks business financing from Adyen Capital for an account holder.',
    points: [
      {
        topic: 'capital',
        title: 'Outstanding financing',
        text: 'Shows how much Capital the account holder has received and still owes.',
      },
      {
        topic: 'payout',
        title: 'Repaid from sales',
        text: 'A share of incoming sales is deducted automatically until the grant is repaid.',
      },
      {
        topic: 'reports',
        title: 'One grant each',
        text: 'Every grant taken is listed under it as a grant reference.',
      },
    ],
  },

  payInstCard: {
    summary: 'A physical or virtual card issued by Adyen, spending from its balance account.',
    points: [
      {
        topic: 'card',
        title: 'One balance account',
        text: 'Each card is a payment instrument tied to exactly one balance account.',
      },
      {
        topic: 'risk',
        title: 'Spending rules',
        text: 'Transaction rules limit where and how much it can spend, for example by amount or merchant category.',
      },
      {
        topic: 'settings',
        title: 'Card lifecycle',
        text: 'Orders, PIN and status (active, suspended, closed) are managed per card.',
      },
      {
        topic: 'reports',
        title: 'Reports',
        text: 'The Payment Instrument Report lists every card and its status.',
      },
    ],
  },

  payInstBiz: {
    summary: 'An Adyen business account: a bank account number on top of the balance account.',
    points: [
      {
        topic: 'bank',
        title: 'Incoming transfers',
        text: 'Others can send bank transfers to it, straight into the balance account.',
      },
      {
        topic: 'payout',
        title: 'Outgoing transfers',
        text: 'Pays third-party bank accounts directly from the balance.',
      },
      {
        topic: 'verify',
        title: 'Banking capability',
        text: 'The account holder needs the banking capability verified first.',
      },
    ],
  },

  grantRef: {
    summary: 'One Capital grant: a single financing offer the account holder accepted.',
    points: [
      {
        topic: 'capital',
        title: 'Terms',
        text: 'The amount, fee and repayment terms of this one grant.',
      },
      {
        topic: 'reports',
        title: 'Repayment',
        text: 'Repayment progress is tracked per grant.',
      },
    ],
  },
};

const LIABLE_BALANCE: ExplainPoint = {
  topic: 'risk',
  title: 'Liable balance account',
  text: "The platform's own balance: it collects commissions and covers users' negative balances.",
};

/** The parent matters once: a balance account under the liable holder is the platform's own. */
export function explanationFor(kind: NodeKind, parentKind: NodeKind | null): Explanation {
  const base = EXPLANATIONS[kind];
  if (kind === 'balanceAcc' && parentKind === 'liableAccHolder') {
    return { summary: base.summary, points: [LIABLE_BALANCE, ...base.points] };
  }
  return base;
}
