/**
 * Brand marks: the vendored payment-method logos and the optional company logo.
 *
 * Everything here resolves to a data URL. That is not an optimisation, it is
 * what makes export work: PNG, JPEG and PDF all rasterise the diagram by
 * loading an SVG *as an image*, and an image-loaded SVG is forbidden from
 * fetching anything external. A logo referenced by URL would simply be missing
 * from every exported file. A data URL also cannot execute script, which is why
 * the vendored markup is rendered through `<img>` rather than inlined into the
 * page.
 */

import type { PaymentLogo } from './paymentLogos';

export type PaymentLogoMap = Record<string, PaymentLogo>;

let logosPromise: Promise<PaymentLogoMap> | null = null;
let loadedLogos: PaymentLogoMap | null = null;

/**
 * The logo module is ~110 kB of markup for 30 brands, so it is only fetched
 * once a diagram actually shows a payment method.
 */
export function loadPaymentLogos(): Promise<PaymentLogoMap> {
  logosPromise ??= import('./paymentLogos').then((module) => {
    loadedLogos = module.PAYMENT_LOGOS;
    return module.PAYMENT_LOGOS;
  });
  return logosPromise;
}

/** The loaded map, or null when nothing has needed it yet. */
export function peekPaymentLogos(): PaymentLogoMap | null {
  return loadedLogos;
}

const paymentUrlCache = new Map<string, string>();

/** Data URL for a vendored payment-method logo. */
export function paymentLogoDataUrl(logos: PaymentLogoMap, id: string): string | null {
  const cached = paymentUrlCache.get(id);
  if (cached !== undefined) return cached;
  const logo = logos[id];
  if (!logo) return null;
  const url = svgDataUrl(logo.svg);
  paymentUrlCache.set(id, url);
  return url;
}

export function svgDataUrl(svg: string): string {
  // encodeURIComponent rather than base64: it keeps the markup readable in the
  // DOM inspector and avoids the 33% size penalty inside the exported SVG.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Up to two initials, used while a logo loads and whenever a company has no
 * domain set. Skips the words that would produce a meaningless letter.
 */
export function monogram(name: string): string {
  const skip = new Set(['the', 'a', 'an', 'of', 'and', 'group', 'holding', 'bv', 'nv', 'ltd', 'inc', 'gmbh', 'sa']);
  const words = name
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '' && !skip.has(word.toLowerCase()));

  const source = words.length > 0 ? words : [name.trim()];
  if (source.length === 1) {
    // A single word gives up its first two letters: "Acme" reads better as "AC".
    return (source[0] ?? '').slice(0, 2).toUpperCase();
  }
  return `${source[0]?.[0] ?? ''}${source[1]?.[0] ?? ''}`.toUpperCase();
}

/**
 * unavatar.io is used because it is the only logo service tested here that
 * answers with `access-control-allow-origin: *`. Without that header the bytes
 * cannot be read, so they cannot be inlined, so the logo cannot appear in an
 * exported image. `fallback=false` makes a miss a 404 instead of a placeholder
 * avatar, which is what lets the monogram take over.
 */
export function companyLogoUrl(domain: string): string {
  return `https://unavatar.io/${encodeURIComponent(domain)}?fallback=false`;
}

const companyLogoCache = new Map<string, Promise<string | null>>();
const resolvedCompanyLogos = new Map<string, string>();

/** Fetches a company logo and returns it as a data URL, or null if there is none. */
export function loadCompanyLogo(domain: string): Promise<string | null> {
  const existing = companyLogoCache.get(domain);
  if (existing) return existing;

  const request = (async (): Promise<string | null> => {
    try {
      const response = await fetch(companyLogoUrl(domain), { mode: 'cors' });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl !== null) resolvedCompanyLogos.set(domain, dataUrl);
      return dataUrl;
    } catch {
      // Offline, blocked, or no such logo: the monogram covers all three.
      return null;
    }
  })();

  companyLogoCache.set(domain, request);
  return request;
}

/** A logo already fetched, for the exporter to read without awaiting. */
export function peekCompanyLogo(domain: string): string | null {
  return resolvedCompanyLogos.get(domain) ?? null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
