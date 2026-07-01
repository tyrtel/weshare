const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const MAX_EMAIL_LENGTH = 254;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'grr.la',
  'sharklasers.com',
  'spam4.me',
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  'temp-mail.org',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'trashmail.com',
  'trashmail.at',
  'trashmail.io',
  'trashmail.me',
  'trashmail.net',
  'trashmail.xyz',
  'dispostable.com',
  'mailnull.com',
  'spamgourmet.com',
  'fakeinbox.com',
  'maildrop.cc',
  'mailnesia.com',
  'mailzilla.com',
  'discard.email',
  'spamex.com',
  'getairmail.com',
  'filzmail.com',
  'jetable.fr.nf',
  'boun.cr',
  'tempr.email',
  'throwam.com',
  'spamherelots.com',
]);

export type EmailValidationError = 'invalid_format' | 'disposable_domain';

export function canonicalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx === -1) return trimmed;

  const local = trimmed.slice(0, atIdx);
  let domain = trimmed.slice(atIdx + 1);

  if (domain === 'googlemail.com') domain = 'gmail.com';

  // Plus addressing is a routing tag, not a distinct identity
  const baseLocal = local.split('+')[0];

  // Gmail ignores dots in the local part entirely
  const normalizedLocal =
    domain === 'gmail.com' ? baseLocal.replace(/\./g, '') : baseLocal;

  return `${normalizedLocal}@${domain}`;
}

export function validateAndNormalizeEmail(raw: string): {
  original: string;   // trimmed input — plus tag preserved, used for auth/storage
  canonical: string;  // normalized — used only for inbox-level dedup checks
  error: EmailValidationError | null;
} {
  const original = raw.trim();

  if (
    original.length > MAX_EMAIL_LENGTH ||
    !EMAIL_REGEX.test(original) ||
    original.split('@').length !== 2
  ) {
    return { original, canonical: original, error: 'invalid_format' };
  }

  const canonical = canonicalizeEmail(original);
  const domain = canonical.split('@')[1] ?? '';

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { original, canonical, error: 'disposable_domain' };
  }

  return { original, canonical, error: null };
}
