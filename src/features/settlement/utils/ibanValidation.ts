// Pure IBAN validation — no external library.
// Algorithm: ISO 13616 mod-97 checksum.

const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22,
  BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22,
  DJ: 27, DK: 18, DO: 28, DZ: 26, EE: 20, EG: 29, ES: 24, FI: 18,
  FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27,
  GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LY: 25, MA: 28, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31,
  MU: 30, MZ: 25, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19,
  SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20,
};

function mod97(numStr: string): number {
  let remainder = 0;
  for (const ch of numStr) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder;
}

function ibanToNumeric(iban: string): string {
  // Move first 4 chars to end, then convert letters to digits (A=10 … Z=35)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  return rearranged
    .toUpperCase()
    .split('')
    .map(ch => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? (code - 55).toString() : ch;
    })
    .join('');
}

export function validateIBAN(raw: string): boolean {
  const iban    = raw.replace(/\s/g, '').toUpperCase();
  const country = iban.slice(0, 2);
  const length  = IBAN_LENGTHS[country];

  if (!length || iban.length !== length) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  return mod97(ibanToNumeric(iban)) === 1;
}

/** Format an IBAN into groups of 4 separated by spaces. */
export function formatIBAN(raw: string): string {
  return raw
    .replace(/\s/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
