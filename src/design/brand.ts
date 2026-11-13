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
 * Where a company logo can come from, tried in order. Both services answer with
 * `access-control-allow-origin: *`; without that header the bytes cannot be
 * read, so they cannot be inlined, so the logo cannot appear in an exported
 * image. Both are also told to answer a miss with a 404 instead of a
 * placeholder, which is what lets the monogram take over.
 *
 * icon.horse goes first because unavatar.io allows an anonymous visitor only
 * 25 requests a day per IP address: an office behind one address uses that up
 * in minutes, after which every logo silently turns back into a monogram.
 */
export function companyLogoUrls(domain: string): readonly string[] {
  const host = encodeURIComponent(domain);
  return [`https://icon.horse/icon/${host}?fallback=404`, `https://unavatar.io/${host}?fallback=false`];
}

const companyLogoCache = new Map<string, Promise<string | null>>();
const resolvedCompanyLogos = new Map<string, string>();

/** Fetches a company logo and returns it as a data URL, or null if there is none. */
export function loadCompanyLogo(domain: string): Promise<string | null> {
  const existing = companyLogoCache.get(domain);
  if (existing) return existing;

  const stored = peekCompanyLogo(domain);
  const request =
    stored !== null
      ? Promise.resolve(stored)
      : (async (): Promise<string | null> => {
          for (const url of companyLogoUrls(domain)) {
            const dataUrl = await fetchImageAsDataUrl(url);
            if (dataUrl !== null) {
              resolvedCompanyLogos.set(domain, dataUrl);
              storeCompanyLogo(domain, dataUrl);
              return dataUrl;
            }
          }
          return null;
        })();

  companyLogoCache.set(domain, request);
  return request;
}

/** A logo already fetched, in this visit or an earlier one, read without awaiting. */
export function peekCompanyLogo(domain: string): string | null {
  return resolvedCompanyLogos.get(domain) ?? storedCompanyLogos().get(domain)?.url ?? null;
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await blobToDataUrl(blob);
  } catch {
    // Offline, blocked, or rate-limited: the next source, or the monogram.
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked, because spreading a large array into one call overflows the stack.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/*
 * Fetched logos are kept in localStorage, so a reload, a second tab or the next
 * day shows them at once and does not spend the logo services' request limits
 * again. Only hits are kept: a miss may just be a rate limit or a dropped
 * connection, and caching it would hide the logo for good.
 */

const LOGO_STORAGE_KEY = 'aas.logos.v1';
/** Favicons run 1 to 10 kB; anything far larger is not worth the quota. */
const MAX_STORED_LOGO_LENGTH = 64 * 1024;
const MAX_STORED_LOGOS = 60;

interface StoredLogo {
  readonly url: string;
  readonly savedAt: number;
}

let storedLogos: Map<string, StoredLogo> | null = null;

function logoStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function storedCompanyLogos(): Map<string, StoredLogo> {
  if (storedLogos !== null) return storedLogos;
  storedLogos = new Map();
  try {
    const raw: unknown = JSON.parse(logoStorage()?.getItem(LOGO_STORAGE_KEY) ?? '{}');
    if (raw !== null && typeof raw === 'object') {
      for (const [domain, entry] of Object.entries(raw as Record<string, unknown>)) {
        if (entry === null || typeof entry !== 'object') continue;
        const { url, savedAt } = entry as Record<string, unknown>;
        // Only image data URLs: anything else in storage was not written here.
        if (typeof url !== 'string' || !url.startsWith('data:image/')) continue;
        storedLogos.set(domain, { url, savedAt: typeof savedAt === 'number' ? savedAt : 0 });
      }
    }
  } catch {
    // Unreadable entry: start over, the logos are fetched again.
  }
  return storedLogos;
}

function storeCompanyLogo(domain: string, url: string): void {
  if (url.length > MAX_STORED_LOGO_LENGTH) return;
  const logos = storedCompanyLogos();
  logos.delete(domain);
  logos.set(domain, { url, savedAt: Date.now() });
  const newestFirst = [...logos.entries()].sort((a, b) => b[1].savedAt - a[1].savedAt);
  for (const [stale] of newestFirst.slice(MAX_STORED_LOGOS)) logos.delete(stale);
  try {
    logoStorage()?.setItem(LOGO_STORAGE_KEY, JSON.stringify(Object.fromEntries(logos)));
  } catch {
    // Quota exceeded: the logo still shows for this visit.
  }
}
