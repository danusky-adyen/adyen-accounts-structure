/**
 * The prompt handed to a language model so it can turn a pile of unstructured
 * notes into a diagram.
 *
 * It is generated from the same registries the editor uses, never written out by
 * hand: a kind, integration or payment method added to the domain shows up in
 * the prompt on the next render, so the two cannot drift apart.
 */

import { INTEGRATIONS } from '../domain/integrations';
import { NODE_KINDS, NODE_SPECS, TERMINAL_KINDS, specOf } from '../domain/kinds';
import { PAYMENT_METHODS } from '../domain/paymentMethods';

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

const EXAMPLE = {
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

Allowed values: ${TERMINAL_KINDS.join(', ')}. Repeat a value to show several of
the same kind.

## Integrations

Use these ids: ${INTEGRATIONS.map((integration) => integration.id).join(', ')}.
"version" is free text; leave it out when the notes do not say.

## Payment methods

Use these ids: ${PAYMENT_METHODS.map((method) => method.id).join(', ')}.

## Example

${JSON.stringify(EXAMPLE, null, 2)}

## The notes to convert

<paste the notes here>
`;
}
