import { useEffect, useState } from 'react';
import {
  loadCompanyLogo,
  loadPaymentLogos,
  peekCompanyLogo,
  peekPaymentLogos,
  type PaymentLogoMap,
} from '../design/brand';

/**
 * The payment-logo map, loaded on first use. Returns null until it arrives, so
 * a diagram with no payment methods never pays for the module.
 */
export function usePaymentLogos(needed: boolean): PaymentLogoMap | null {
  const [logos, setLogos] = useState<PaymentLogoMap | null>(() => peekPaymentLogos());

  useEffect(() => {
    if (!needed || logos !== null) return;
    let active = true;
    void loadPaymentLogos().then((loaded) => {
      if (active) setLogos(loaded);
    });
    return () => {
      active = false;
    };
  }, [needed, logos]);

  return logos;
}

/** A company logo as a data URL, or null while it loads or if there is none. */
export function useCompanyLogo(domain: string): string | null {
  // Tagged with its domain so a stale result never shows on a renamed brand.
  const [loaded, setLoaded] = useState<{ readonly domain: string; readonly url: string | null } | null>(null);
  const cached = domain === '' ? null : peekCompanyLogo(domain);

  useEffect(() => {
    if (domain === '' || peekCompanyLogo(domain) !== null) return;
    let active = true;
    void loadCompanyLogo(domain).then((url) => {
      if (active) setLoaded({ domain, url });
    });
    return () => {
      active = false;
    };
  }, [domain]);

  if (domain === '') return null;
  return cached ?? (loaded?.domain === domain ? loaded.url : null);
}
