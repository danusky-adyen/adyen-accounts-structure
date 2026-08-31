/**
 * The prompt handed to a language model so it can turn a pile of unstructured
 * notes into a diagram.
 *
 * It is generated from the same registries the editor uses, never written out by
 * hand: a kind, integration or payment method added to the domain shows up in
 * the prompt on the next render, so the two cannot drift apart.
 */

import { INTEGRATIONS } from '../domain/integrations';
import { NODE_KINDS, NODE_SPECS, TERMINAL_CATEGORIES, TERMINAL_KINDS, specOf } from '../domain/kinds';
import { PAYMENT_METHODS } from '../domain/paymentMethods';

const TERMINAL_MODELS = TERMINAL_KINDS.filter(
  (kind) => !(TERMINAL_CATEGORIES as readonly string[]).includes(kind),
);

/** Marks example notes as quoted material, so they cannot read as instructions. */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function childRules(): string {
  return NODE_KINDS.filter((kind) => NODE_SPECS[kind].childKinds.length > 0)
    .map((kind) => {
      const spec = NODE_SPECS[kind];
      const children = spec.childKinds
        .map((child) => {
          const limit = spec.childLimits[child];
          return limit === undefined ? child : `${child} (max ${limit})`;
        })
        .join(', ');
      return `- ${kind} may contain: ${children}`;
    })
    .join('\n');
}

function capabilities(): string {
  const rows: string[] = [];
  for (const kind of NODE_KINDS) {
    const spec = specOf(kind);
    const flags: string[] = [];
    if (spec.supportsTerminals) flags.push('terminals');
    if (spec.supportsIntegrations) flags.push('integrations');
    if (spec.supportsMethods) flags.push('methods');
    if (spec.supportsLogo) flags.push('logoDomain');
    if (flags.length > 0) rows.push(`- ${kind}: ${flags.join(', ')}`);
  }
  return rows.join('\n');
}

const RICH_NOTES = `Acme Group (acme.com), MCC 5411, ecommerce enabled.
Acme Online is their webshop, Drop-in v6 plus a Shopify plugin, cards, iDEAL and
Klarna. Ecom is switched off on that account for now.
Acme Stores runs Terminal API cloud with counter and mobile terminals, and the
New York flagship has a counter terminal.
Payouts to their sellers run through Acme Balance Platform, which funds both the
webshop and the stores, with one account holder "Acme Payouts" holding a EUR
balance.`;

const RICH_EXAMPLE = {
  root: {
    id: 'acme',
    kind: 'company',
    name: 'Acme Group',
    logoDomain: 'acme.com',
    settings: { merchantCategoryCode: '5411', allowEcomm: 'true' },
    children: [
      {
        id: 'acme-web',
        kind: 'ecom',
        name: 'Acme Online',
        integrations: [{ id: 'webDropin', version: 'v6' }, { id: 'shopify' }],
        methods: ['visa', 'mc', 'ideal', 'klarna'],
        settings: { allowEcomm: 'false' },
        links: ['acme-bp'],
      },
      {
        id: 'acme-stores',
        kind: 'pos',
        name: 'Acme Stores',
        integrations: [{ id: 'terminalApiCloud' }],
        terminals: ['counter', 'mobile'],
        children: [{ id: 'acme-nyc', kind: 'store', name: 'New York Flagship', terminals: ['counter'] }],
        links: ['acme-bp'],
      },
      {
        id: 'acme-bp',
        kind: 'bp',
        name: 'Acme Balance Platform',
        children: [
          {
            id: 'acme-holder',
            kind: 'accHolder',
            name: 'Acme Payouts',
            children: [{ kind: 'balanceAcc', name: 'EUR Balance' }],
          },
        ],
      },
    ],
  },
};

const SPARSE_NOTES = `Bakery chain "Rye & Co", 3 shops in Antwerp, card payments
on the counter. No online sales yet.`;

/**
 * The counterweight to the example above: notes that mention little must produce
 * little. Without it, models copy the shape of the rich example and invent a
 * balance platform, account holders and payment methods nobody asked for.
 */
const SPARSE_EXAMPLE = {
  root: {
    kind: 'company',
    name: 'Rye & Co',
    children: [
      {
        kind: 'pos',
        name: 'Rye & Co Shops',
        children: [
          { kind: 'store', name: 'Antwerp 1', terminals: ['counter'] },
          { kind: 'store', name: 'Antwerp 2', terminals: ['counter'] },
          { kind: 'store', name: 'Antwerp 3', terminals: ['counter'] },
        ],
      },
    ],
  },
};

/** The full prompt, ready to paste into any chat model. */
export function buildImportPrompt(): string {
  return `You are turning notes about a merchant's Adyen setup into a JSON diagram.

Return ONLY a JSON object, with no prose and no code fences.

## Shape

Every node is:
{
  "id": "a unique string you invent, only needed when something links to it",
  "kind": "one of the kinds below",
  "name": "what to show on the card",
  "note": "optional free text",
  "settings": { "parameterName": "value" },
  "terminals": ["counter"],
  "integrations": [{ "id": "webDropin", "version": "v6" }],
  "methods": ["visa", "mc"],
  "logoDomain": "acme.com",
  "links": ["id of another node"],
  "children": []
}

Leave out anything you do not know. The document is { "root": <node> } and the
root is always kind "company".

## Only what the notes say

Draw the structure the notes describe and nothing else. Every node, field and
value has to be traceable to something in the notes.

- Do not add a balance platform. Include kind "bp" only when the notes actually
  point to one: a balance platform, platform payouts to sellers or sub-merchants,
  wallets, balances, or card issuing. Everything that lives under it
  (accHolder, liableAccHolder, balanceAcc, grantAcc, payInstCard, payInstBiz,
  legalEntity, businessLine, transferInst) follows the same rule.
- Do not add stores, terminals, integrations, payment methods or settings that
  the notes do not mention. An empty list is better than a plausible guess.
- A company with one ecom account under it is a complete answer when that is all
  the notes describe. Small structures are expected; do not pad one to look like
  the longer example below.
- Where the notes state a quantity ("40 shops"), create what they state, and
  where they only imply a node (in-person payments imply a pos account), add
  just that node.

If you are unsure whether something belongs, leave it out. The person reading
the diagram can add it in two clicks; removing what was never true is harder.

## Kinds

${NODE_KINDS.map((kind) => `- ${kind}: ${specOf(kind).description}`).join('\n')}

## What can go inside what

${childRules()}

## Which fields each kind accepts

${capabilities()}

Everything else is ignored, so do not put terminals on a company or payment
methods on a legal entity.

## Links

A link is a relationship that is not ownership. Give the target node an "id" and
list that id under "links" on the source node. The pairs that are allowed:

- a merchant account (pos, ecom) to a balance platform (bp): use this when the
  merchant account is funded by that platform. A merchant account may link to at
  most ONE balance platform; several merchant accounts may share the same one.
- pos to ecom, when the same business sells both in person and online
- businessLine to store

Do not link a balance platform to another balance platform.

## Settings

Free text, both the parameter name and the value. Use the real Adyen names when
the notes mention them (account data properties such as merchantCategoryCode or
allowEcomm, terminal settings, and so on). Put a setting at the highest level it
is true for: a value on the company is inherited by every account below it, and
a value repeated further down is shown as an override. Only repeat it lower down
when it genuinely differs there.

## Terminals

Families: ${TERMINAL_CATEGORIES.join(', ')}. Models, which the notes have to name
before you may use one: ${TERMINAL_MODELS.join(', ')}. Use the family when the
notes only say what kind of hardware a store runs. Repeat a value to show
several of the same terminal.

## Integrations

Use these ids: ${INTEGRATIONS.map((integration) => integration.id).join(', ')}.
"version" is free text; leave it out when the notes do not say.

## Payment methods

Use these ids: ${PAYMENT_METHODS.map((method) => method.id).join(', ')}.

## Examples

Notes that mention a lot:

${quote(RICH_NOTES)}

${JSON.stringify(RICH_EXAMPLE, null, 2)}

Notes that mention little. Nothing is added to fill the diagram out, and there is
no balance platform because the notes never point to one:

${quote(SPARSE_NOTES)}

${JSON.stringify(SPARSE_EXAMPLE, null, 2)}

## The notes to convert

<paste the notes here>
`;
}
