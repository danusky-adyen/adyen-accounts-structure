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
  const [dataUrl, setDataUrl] = useState<string | null>(() => (domain === '' ? null : peekCompanyLogo(domain)));

  useEffect(() => {
    if (domain === '') {
      setDataUrl(null);
      return;
    }
    const cached = peekCompanyLogo(domain);
    if (cached !== null) {
      setDataUrl(cached);
      return;
    }
    let active = true;
    setDataUrl(null);
    void loadCompanyLogo(domain).then((loaded) => {
      if (active) setDataUrl(loaded);
    });
    return () => {
      active = false;
    };
  }, [domain]);

  return dataUrl;
}
