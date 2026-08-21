import { describe, expect, it } from 'vitest';
import type { StructureDocument } from '../src/domain/document';
import { setSetting } from '../src/domain/operations';
import {
  MAX_SETTING_KEY_LENGTH,
  findSetting,
  knownSettingKeys,
  overridesBelow,
  resolveSettings,
  settingKey,
  settingsSummary,
} from '../src/domain/settings';
import { byName, doc, named, node } from './helpers';

/** Company > merchant account > store, each level nameable from the test. */
function chain(): StructureDocument {
  return doc(named('company', 'Group', named('pos', 'Retail', named('store', 'Shop'))));
}

describe('resolveSettings', () => {
  it('reports a value set above as inherited, naming the level it came from', () => {
    let document = chain();
    const group = document.root;
    document = setSetting(document, group.id, 'captureDelay', 'immediate');

    const shop = byName(document, 'Shop');
    const resolved = resolveSettings(document, shop.id);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.key).toBe('captureDelay');
    expect(resolved[0]?.value).toBe('immediate');
    expect(resolved[0]?.source).toBe('inherited');
    expect(resolved[0]?.inheritedFrom?.name).toBe('Group');
    expect(resolved[0]?.inheritedFrom?.id).toBe(group.id);
    expect(resolved[0]?.overriddenBy).toEqual([]);
  });

  it('lets the nearest level win when two levels above set the same key', () => {
    let document = chain();
    document = setSetting(document, document.root.id, 'captureDelay', 'immediate');
    const retail = byName(document, 'Retail');
    document = setSetting(document, retail.id, 'captureDelay', 'manual');

    const resolved = resolveSettings(document, byName(document, 'Shop').id);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.value).toBe('manual');
    expect(resolved[0]?.inheritedFrom?.name).toBe('Retail');
  });

  it('marks a key set here as own, and says what it replaces', () => {
    let document = chain();
    document = setSetting(document, document.root.id, 'captureDelay', 'immediate');
    document = setSetting(document, byName(document, 'Shop').id, 'captureDelay', 'manual');

    const resolved = resolveSettings(document, byName(document, 'Shop').id);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.source).toBe('own');
    expect(resolved[0]?.value).toBe('manual');
    expect(resolved[0]?.inheritedFrom?.name).toBe('Group');
    expect(resolved[0]?.inheritedValue).toBe('immediate');
  });

  it('lists the levels below that disagree', () => {
    let document = chain();
    document = setSetting(document, document.root.id, 'captureDelay', 'immediate');
    document = setSetting(document, byName(document, 'Retail').id, 'captureDelay', 'manual');
    document = setSetting(document, byName(document, 'Shop').id, 'captureDelay', 'delayed');

    const resolved = resolveSettings(document, document.root.id);
    expect(resolved[0]?.source).toBe('own');
    expect(resolved[0]?.overriddenBy.map((origin) => origin.name)).toEqual(['Retail', 'Shop']);
  });

  it('puts own settings first, then the inherited ones from nearest outwards', () => {
    let document = chain();
    document = setSetting(document, document.root.id, 'fromGroup', '1');
    document = setSetting(document, byName(document, 'Retail').id, 'fromRetail', '2');
    document = setSetting(document, byName(document, 'Shop').id, 'ownKey', '3');

    const resolved = resolveSettings(document, byName(document, 'Shop').id);
    expect(resolved.map((entry) => entry.key)).toEqual(['ownKey', 'fromRetail', 'fromGroup']);
    expect(resolved.map((entry) => entry.source)).toEqual(['own', 'inherited', 'inherited']);
  });

  it('returns nothing for an id that is not in the document', () => {
    expect(resolveSettings(chain(), 'nowhere')).toEqual([]);
  });
});

describe('overridesBelow', () => {
  it('ignores the settings on the node itself and collects only what is underneath', () => {
    let document = chain();
    document = setSetting(document, byName(document, 'Retail').id, 'captureDelay', 'manual');
    document = setSetting(document, byName(document, 'Shop').id, 'captureDelay', 'delayed');
    document = setSetting(document, byName(document, 'Shop').id, 'shopperStatement', 'SHOP');

    const below = overridesBelow(document, byName(document, 'Retail').id);
    expect(below.get('captureDelay')?.map((origin) => origin.name)).toEqual(['Shop']);
    expect(below.get('shopperStatement')?.map((origin) => origin.name)).toEqual(['Shop']);

    expect(overridesBelow(document, byName(document, 'Shop').id).size).toBe(0);
  });

  it('is empty for an id that is not in the document', () => {
    expect(overridesBelow(chain(), 'nowhere').size).toBe(0);
  });
});

describe('settingsSummary', () => {
  it('counts own, inherited, overriding and overridden rows', () => {
    let document = chain();
    document = setSetting(document, document.root.id, 'captureDelay', 'immediate');
    document = setSetting(document, document.root.id, 'shopperStatement', 'GROUP');
    document = setSetting(document, byName(document, 'Retail').id, 'captureDelay', 'manual');
    document = setSetting(document, byName(document, 'Shop').id, 'captureDelay', 'delayed');

    expect(settingsSummary(document, document.root.id)).toEqual({
      own: 2,
      inherited: 0,
      overriding: 0,
      overriddenBelow: 1,
    });
    expect(settingsSummary(document, byName(document, 'Retail').id)).toEqual({
      own: 1,
      inherited: 1,
      overriding: 1,
      overriddenBelow: 1,
    });
    expect(settingsSummary(document, byName(document, 'Shop').id)).toEqual({
      own: 1,
      inherited: 1,
      overriding: 1,
      overriddenBelow: 0,
    });
  });
});

describe('setting keys', () => {
  it('trims a key and caps its length', () => {
    expect(settingKey('  captureDelay  ')).toBe('captureDelay');
    expect(settingKey('k'.repeat(MAX_SETTING_KEY_LENGTH + 20))).toHaveLength(MAX_SETTING_KEY_LENGTH);
  });

  it('looks a setting up by its trimmed key', () => {
    const settings = [{ key: 'captureDelay', value: 'immediate' }];
    expect(findSetting(settings, ' captureDelay ')?.value).toBe('immediate');
    expect(findSetting(settings, 'capturedelay')).toBeNull();
    expect(findSetting(settings, 'missing')).toBeNull();
  });

  it('lists every key used in the document, sorted', () => {
    let document = doc(node('company', node('pos'), node('ecom')));
    document = setSetting(document, byName(document, 'Ecom').id, 'zeta', '1');
    document = setSetting(document, byName(document, 'POS').id, 'alpha', '2');
    document = setSetting(document, document.root.id, 'zeta', '3');

    expect(knownSettingKeys(document)).toEqual(['alpha', 'zeta']);
  });
});
