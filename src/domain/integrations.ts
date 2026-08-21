/**
 * Integration types a merchant account can run, grouped the way Adyen's own
 * documentation splits them: online, in-app, in-person, and the plugins and
 * platform products built on top.
 *
 * `version` on a node's integration is free text on purpose: SDK and API
 * versions move faster than this tool, so the registry only suggests.
 */

export const INTEGRATION_GROUPS = [
  { id: 'online', label: 'Online' },
  { id: 'app', label: 'In-app' },
  { id: 'inperson', label: 'In-person' },
  { id: 'plugin', label: 'Plugin or partner' },
  { id: 'platform', label: 'Platform product' },
] as const;

export type IntegrationGroupId = (typeof INTEGRATION_GROUPS)[number]['id'];

export interface IntegrationSpec {
  readonly id: string;
  readonly label: string;
  readonly group: IntegrationGroupId;
  /** Short badge shown on the card when the chip is too narrow for the label. */
  readonly short: string;
  /** Version suggestions offered next to the free-text field. */
  readonly versions: readonly string[];
}

function integration(
  id: string,
  label: string,
  group: IntegrationGroupId,
  short: string,
  versions: readonly string[] = [],
): IntegrationSpec {
  return { id, label, group, short, versions };
}

const CHECKOUT_API = ['v71', 'v70', 'v69', 'v68'];

export const INTEGRATIONS: readonly IntegrationSpec[] = [
  integration('webDropin', 'Web Drop-in', 'online', 'Web', ['v6', 'v5.x', 'v4.x']),
  integration('webComponents', 'Web Components', 'online', 'Web', ['v6', 'v5.x', 'v4.x']),
  integration('apiOnly', 'API only', 'online', 'API', CHECKOUT_API),
  integration('payByLink', 'Pay by Link', 'online', 'PBL', []),
  integration('hostedCheckout', 'Hosted Checkout', 'online', 'HPP', []),
  integration('iosSdk', 'iOS SDK', 'app', 'iOS', ['v5.x', 'v4.x']),
  integration('androidSdk', 'Android SDK', 'app', 'Android', ['v5.x', 'v4.x']),
  integration('reactNative', 'React Native', 'app', 'RN', ['v2.x', 'v1.x']),
  integration('flutter', 'Flutter', 'app', 'Flutter', ['v1.x']),
  integration('terminalApiCloud', 'Terminal API (cloud)', 'inperson', 'TAPI', []),
  integration('terminalApiLocal', 'Terminal API (local)', 'inperson', 'TAPI', []),
  integration('posMobileSdk', 'POS Mobile SDK', 'inperson', 'POS SDK', ['v5.x', 'v4.x']),
  integration('tapToPay', 'Tap to Pay', 'inperson', 'TTP', ['iOS', 'Android']),
  integration('standalone', 'Standalone terminals', 'inperson', 'Standalone', []),
  integration('shopify', 'Shopify', 'plugin', 'Shopify', []),
  integration('adobeCommerce', 'Adobe Commerce', 'plugin', 'Adobe', ['v9.x', 'v8.x']),
  integration('sapCommerce', 'SAP Commerce Cloud', 'plugin', 'SAP', []),
  integration('salesforce', 'Salesforce Commerce', 'plugin', 'SFCC', []),
  integration('dynamics365', 'Dynamics 365', 'plugin', 'D365', []),
  integration('oracle', 'Oracle (Simphony, Opera)', 'plugin', 'Oracle', []),
  integration('bigCommerce', 'BigCommerce', 'plugin', 'BigC', []),
  integration('wooCommerce', 'WooCommerce', 'plugin', 'Woo', []),
  integration('shopware', 'Shopware', 'plugin', 'Shopware', ['v6']),
  integration('lightspeed', 'Lightspeed', 'plugin', 'Lightspeed', []),
  integration('mirakl', 'Mirakl', 'plugin', 'Mirakl', []),
  integration('otherPartner', 'Other partner', 'plugin', 'Partner', []),
  integration('platforms', 'Adyen for Platforms', 'platform', 'Platforms', []),
  integration('marketplace', 'Marketplace', 'platform', 'Marketplace', []),
  integration('issuing', 'Issuing', 'platform', 'Issuing', []),
  integration('capital', 'Capital', 'platform', 'Capital', []),
];

const BY_ID = new Map(INTEGRATIONS.map((entry) => [entry.id, entry] as const));

export function integrationSpec(id: string): IntegrationSpec | null {
  return BY_ID.get(id) ?? null;
}

export function isIntegrationId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Label with the version appended, which is what card chips and exports show. */
export function integrationLabel(id: string, version: string, short = false): string {
  const spec = BY_ID.get(id);
  const base = spec ? (short ? spec.short : spec.label) : id;
  return version === '' ? base : `${base} ${version}`;
}
