/**
 * Company logos come from public services with tight anonymous limits, so a
 * logo that was found once has to survive a reload without another request.
 * Each test imports a fresh copy of the module, which is what a reload does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LOGO_KEY = 'aas.logos.v1';

class MemoryStorage {
  readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

type Answer = { status: number; type?: string; body?: string };

let storage: MemoryStorage;
let answers: Map<string, Answer>;
let fetched: string[];

function png(status = 200, body = 'png-bytes'): Answer {
  return { status, type: 'image/png', body };
}

async function freshBrand() {
  vi.resetModules();
  return import('../src/design/brand');
}

/** The icon.horse and unavatar URLs for a domain, in the order they are tried. */
function sources(brand: Awaited<ReturnType<typeof freshBrand>>, domain: string): [string, string] {
  const [first = '', second = ''] = brand.companyLogoUrls(domain);
  return [first, second];
}

beforeEach(() => {
  storage = new MemoryStorage();
  answers = new Map();
  fetched = [];
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('fetch', (url: string) => {
    fetched.push(url);
    const answer = answers.get(url) ?? { status: 404 };
    return Promise.resolve(
      new Response(answer.body ?? '', {
        status: answer.status,
        headers: answer.type ? { 'content-type': answer.type } : {},
      }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('company logos', () => {
  it('uses icon.horse first and does not touch unavatar when it answers', async () => {
    const brand = await freshBrand();
    const [iconHorse] = sources(brand, 'acme.com');
    answers.set(iconHorse, png());

    const url = await brand.loadCompanyLogo('acme.com');

    expect(url).toBe(`data:image/png;base64,${btoa('png-bytes')}`);
    expect(fetched).toEqual([iconHorse]);
    expect(brand.peekCompanyLogo('acme.com')).toBe(url);
  });

  it('falls back to unavatar when icon.horse has no logo', async () => {
    const brand = await freshBrand();
    const [, unavatar] = sources(brand, 'acme.com');
    answers.set(unavatar, png(200, 'from-unavatar'));

    const url = await brand.loadCompanyLogo('acme.com');

    expect(url).toBe(`data:image/png;base64,${btoa('from-unavatar')}`);
    expect(fetched).toHaveLength(2);
  });

  it('skips an answer that is not an image', async () => {
    const brand = await freshBrand();
    const [iconHorse, unavatar] = sources(brand, 'acme.com');
    answers.set(iconHorse, { status: 200, type: 'text/html', body: '<html>' });
    answers.set(unavatar, png());

    expect(await brand.loadCompanyLogo('acme.com')).toMatch(/^data:image\/png;base64,/);
  });

  it('returns null and stores nothing when every source fails', async () => {
    const brand = await freshBrand();
    const [iconHorse, unavatar] = sources(brand, 'acme.com');
    answers.set(iconHorse, { status: 404 });
    answers.set(unavatar, { status: 429 });

    expect(await brand.loadCompanyLogo('acme.com')).toBeNull();
    expect(storage.getItem(LOGO_KEY)).toBeNull();

    // A reload tries again, because the miss may only have been a rate limit.
    const reloaded = await freshBrand();
    answers.set(iconHorse, png());
    expect(await reloaded.loadCompanyLogo('acme.com')).not.toBeNull();
  });

  it('shows a stored logo after a reload without fetching it again', async () => {
    const first = await freshBrand();
    answers.set(sources(first, 'acme.com')[0], png());
    const url = await first.loadCompanyLogo('acme.com');

    const reloaded = await freshBrand();
    fetched = [];
    expect(reloaded.peekCompanyLogo('acme.com')).toBe(url);
    expect(await reloaded.loadCompanyLogo('acme.com')).toBe(url);
    expect(fetched).toEqual([]);
  });

  it('keeps only the most recent logos', async () => {
    const brand = await freshBrand();
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1));
    for (let index = 0; index < 65; index += 1) {
      const domain = `brand${index}.com`;
      answers.set(sources(brand, domain)[0], png());
      await brand.loadCompanyLogo(domain);
    }

    const stored = JSON.parse(storage.getItem(LOGO_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(60);
    expect(stored['brand0.com']).toBeUndefined();
    expect(stored['brand64.com']).toBeDefined();
  });

  it('does not store a logo too large for the quota', async () => {
    const brand = await freshBrand();
    answers.set(sources(brand, 'huge.com')[0], png(200, 'x'.repeat(100_000)));

    expect(await brand.loadCompanyLogo('huge.com')).not.toBeNull();
    expect(storage.getItem(LOGO_KEY)).toBeNull();
  });

  it('ignores a corrupt or foreign storage entry', async () => {
    storage.setItem(LOGO_KEY, '{"acme.com":{"url":"javascript:alert(1)"},"bad.com":7}');
    const brand = await freshBrand();
    expect(brand.peekCompanyLogo('acme.com')).toBeNull();
    expect(brand.peekCompanyLogo('bad.com')).toBeNull();

    storage.setItem(LOGO_KEY, 'not json');
    const again = await freshBrand();
    expect(again.peekCompanyLogo('acme.com')).toBeNull();
  });
});
