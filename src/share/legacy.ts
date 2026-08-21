/**
 * Readers for everything the previous version produced, so no existing link or
 * saved diagram is lost:
 *
 *  - `#cfg=` share links (LZString-compressed JSON with per-node random ids)
 *  - the even older `#cfg=` shape that only described company + merchants + stores
 *  - the `adyen_v70` localStorage entry, which held raw `innerHTML`
 *
 * All three are converted to loose `RawNode` trees and handed to
 * `normalizeDocument`, which is the only code that validates them.
 */

import LZString from 'lz-string';
import type { StructureDocument } from '../domain/document';
import { normalizeDocument, normalizeKind, type RawNode } from '../domain/normalize';
import { isTerminalKind, type TerminalKind } from '../domain/kinds';

export const LEGACY_STORAGE_KEY = 'adyen_v70';

interface LegacyNode {
  id?: unknown;
  t?: unknown;
  n?: unknown;
  nt?: unknown;
  tm?: unknown;
  lt?: unknown;
  c?: unknown;
}

interface LegacyFlatConfig {
  /** Company name in the oldest format. */
  c?: unknown;
  cn?: unknown;
  m?: unknown;
}

function splitList(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function terminalsFrom(value: unknown): TerminalKind[] {
  return splitList(value).filter(isTerminalKind);
}

function convertLegacyNode(raw: LegacyNode): RawNode | null {
  const kind = normalizeKind(raw.t);
  if (kind === null) return null;

  const children: RawNode[] = [];
  if (Array.isArray(raw.c)) {
    for (const child of raw.c) {
      if (typeof child !== 'object' || child === null) continue;
      const converted = convertLegacyNode(child as LegacyNode);
      if (converted) children.push(converted);
    }
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    kind,
    name: typeof raw.n === 'string' ? raw.n : undefined,
    note: typeof raw.nt === 'string' ? raw.nt : '',
    terminals: terminalsFrom(raw.tm),
    links: splitList(raw.lt),
    children,
  };
}

/** The first release only knew about company, merchant accounts and stores. */
function convertOldestConfig(config: LegacyFlatConfig): RawNode {
  const merchants: RawNode[] = [];
  if (Array.isArray(config.m)) {
    for (const entry of config.m) {
      if (typeof entry !== 'object' || entry === null) continue;
      const merchant = entry as { t?: unknown; n?: unknown; nt?: unknown; tm?: unknown; s?: unknown };
      const stores: RawNode[] = [];
      if (Array.isArray(merchant.s)) {
        for (const store of merchant.s) {
          if (typeof store !== 'object' || store === null) continue;
          const item = store as { n?: unknown; nt?: unknown; tm?: unknown };
          stores.push({
            kind: 'store',
            name: typeof item.n === 'string' ? item.n : undefined,
            note: typeof item.nt === 'string' ? item.nt : '',
            terminals: terminalsFrom(item.tm),
            children: [],
          });
        }
      }
      merchants.push({
        kind: merchant.t === 1 ? 'ecom' : 'pos',
        name: typeof merchant.n === 'string' ? merchant.n : undefined,
        note: typeof merchant.nt === 'string' ? merchant.nt : '',
        children: stores,
      });
    }
  }

  return {
    kind: 'company',
    name: typeof config.c === 'string' ? config.c : undefined,
    note: typeof config.cn === 'string' ? config.cn : '',
    children: merchants,
  };
}

/** Decodes a legacy `#cfg=` payload. Returns null when it is not one. */
export function decodeLegacyShareLink(encoded: string): StructureDocument | null {
  let parsed: unknown;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const config = parsed as LegacyFlatConfig & LegacyNode;
  if (Array.isArray(config.m)) return normalizeDocument({ root: convertOldestConfig(config) });

  const root = convertLegacyNode(config);
  if (!root) return null;
  return normalizeDocument({ root });
}

/**
 * Rebuilds a document from the markup the previous version kept in
 * localStorage. Only runs in the browser, where `DOMParser` exists.
 */
export function importLegacyMarkup(markup: string): StructureDocument | null {
  if (typeof DOMParser === 'undefined' || markup.trim() === '') return null;

  let root: Element | null;
  try {
    const parsed = new DOMParser().parseFromString(`<ul id="legacy-root">${markup}</ul>`, 'text/html');
    root = parsed.getElementById('legacy-root');
  } catch {
    return null;
  }
  if (!root) return null;

  const items = directChildren(root, 'li');
  const first = items[0];
  if (!first) return null;

  const rawRoot = convertLegacyElement(first);
  if (!rawRoot) return null;
  return normalizeDocument({ root: rawRoot });
}

function directChildren(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === tag);
}

function convertLegacyElement(item: Element): RawNode | null {
  const card = directChildren(item, 'div').find((child) => child.classList.contains('node-card'));
  if (!card) return null;

  const kind = normalizeKind(card.getAttribute('data-type'));
  if (kind === null) return null;

  const label = card.querySelector('.label');
  const childList = directChildren(item, 'ul')[0];
  const children: RawNode[] = [];
  if (childList) {
    for (const childItem of directChildren(childList, 'li')) {
      const converted = convertLegacyElement(childItem);
      if (converted) children.push(converted);
    }
  }

  return {
    id: card.id !== '' ? card.id : undefined,
    kind,
    name: label?.textContent ?? undefined,
    note: card.getAttribute('data-note') ?? '',
    terminals: terminalsFrom(card.getAttribute('data-terms')),
    links: splitList(card.getAttribute('data-linked-to')),
    children,
  };
}
