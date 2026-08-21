/**
 * Settings inheritance.
 *
 * Adyen resolves configuration the same way at every level: a value set lower
 * down replaces the value inherited from above, and the Customer Area labels
 * each row with the level it came from. This module produces exactly that view
 * for a node, plus the reverse direction (what is overridden below it) so a
 * company-level row can say that some of its accounts disagree.
 */

import { ancestorsOf, forEachNode, type NodeId, type Setting, type StructureDocument } from './document';
import { findNode } from './document';

export const MAX_SETTING_KEY_LENGTH = 80;
export const MAX_SETTING_VALUE_LENGTH = 200;
export const MAX_SETTINGS_PER_NODE = 60;

export interface SettingOrigin {
  readonly id: NodeId;
  readonly name: string;
}

export type SettingSource = 'own' | 'inherited';

export interface ResolvedSetting {
  readonly key: string;
  /** The value that applies at this node. */
  readonly value: string;
  readonly source: SettingSource;
  /** Nearest ancestor that also sets this key, if any. */
  readonly inheritedFrom: SettingOrigin | null;
  /** The inherited value being replaced, when this node overrides one. */
  readonly inheritedValue: string | null;
  /** Descendants that set the same key, nearest first. */
  readonly overriddenBy: readonly SettingOrigin[];
}

/** Trimmed key, used for lookups. Adyen property names are case-sensitive. */
export function settingKey(key: string): string {
  return key.trim().slice(0, MAX_SETTING_KEY_LENGTH);
}

export function findSetting(settings: readonly Setting[], key: string): Setting | null {
  const wanted = settingKey(key);
  return settings.find((setting) => setting.key === wanted) ?? null;
}

/**
 * Every setting that applies to `id`: the ones set here and the ones inherited
 * from above, each tagged with where it comes from and what contradicts it.
 */
export function resolveSettings(doc: StructureDocument, id: NodeId): ResolvedSetting[] {
  const node = findNode(doc, id);
  if (!node) return [];

  // Nearest ancestor first, so the first hit for a key is the one that applies.
  const chain = ancestorsOf(doc, id).reverse();
  const below = overridesBelow(doc, id);

  const resolved: ResolvedSetting[] = [];
  const seen = new Set<string>();

  for (const setting of node.settings) {
    const ancestor = chain.find((candidate) => findSetting(candidate.settings, setting.key) !== null);
    const inherited = ancestor ? findSetting(ancestor.settings, setting.key) : null;
    seen.add(setting.key);
    resolved.push({
      key: setting.key,
      value: setting.value,
      source: 'own',
      inheritedFrom: ancestor ? { id: ancestor.id, name: ancestor.name } : null,
      inheritedValue: inherited?.value ?? null,
      overriddenBy: below.get(setting.key) ?? [],
    });
  }

  for (const ancestor of chain) {
    for (const setting of ancestor.settings) {
      if (seen.has(setting.key)) continue;
      seen.add(setting.key);
      resolved.push({
        key: setting.key,
        value: setting.value,
        source: 'inherited',
        inheritedFrom: { id: ancestor.id, name: ancestor.name },
        inheritedValue: setting.value,
        overriddenBy: below.get(setting.key) ?? [],
      });
    }
  }

  return resolved;
}

/** Descendants of `id` that set each key, nearest first. */
export function overridesBelow(doc: StructureDocument, id: NodeId): Map<string, SettingOrigin[]> {
  const node = findNode(doc, id);
  const result = new Map<string, SettingOrigin[]>();
  if (!node) return result;

  const visit = (current: typeof node, depth: number): void => {
    if (depth > 0) {
      for (const setting of current.settings) {
        const entries = result.get(setting.key) ?? [];
        entries.push({ id: current.id, name: current.name });
        result.set(setting.key, entries);
      }
    }
    for (const child of current.children) visit(child, depth + 1);
  };
  visit(node, 0);
  return result;
}

export interface SettingsSummary {
  /** Settings set on this node. */
  readonly own: number;
  /** Settings that only apply because an ancestor sets them. */
  readonly inherited: number;
  /** Own settings that replace an inherited value. */
  readonly overriding: number;
  /** Own settings that something below disagrees with. */
  readonly overriddenBelow: number;
}

export function settingsSummary(doc: StructureDocument, id: NodeId): SettingsSummary {
  const resolved = resolveSettings(doc, id);
  return {
    own: resolved.filter((entry) => entry.source === 'own').length,
    inherited: resolved.filter((entry) => entry.source === 'inherited').length,
    overriding: resolved.filter((entry) => entry.source === 'own' && entry.inheritedFrom !== null).length,
    overriddenBelow: resolved.filter((entry) => entry.overriddenBy.length > 0).length,
  };
}

/** Keys used anywhere in the document, for the key suggestions in the editor. */
export function knownSettingKeys(doc: StructureDocument): string[] {
  const keys = new Set<string>();
  forEachNode(doc, (node) => {
    for (const setting of node.settings) keys.add(setting.key);
  });
  return [...keys].sort((a, b) => a.localeCompare(b));
}
