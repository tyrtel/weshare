import { canonicalizeEmail, validateAndNormalizeEmail } from '../emailValidation';

describe('canonicalizeEmail', () => {
  it('lowercases the entire address', () => {
    expect(canonicalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(canonicalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('strips plus addressing', () => {
    expect(canonicalizeEmail('user+tag@example.com')).toBe('user@example.com');
    expect(canonicalizeEmail('user+long.tag+extra@example.com')).toBe('user@example.com');
  });

  it('strips dots from Gmail local part', () => {
    expect(canonicalizeEmail('u.s.e.r@gmail.com')).toBe('user@gmail.com');
  });

  it('strips both plus and dots for Gmail', () => {
    expect(canonicalizeEmail('u.s.e.r+spam@gmail.com')).toBe('user@gmail.com');
  });

  it('normalizes googlemail.com to gmail.com', () => {
    expect(canonicalizeEmail('user@googlemail.com')).toBe('user@gmail.com');
  });

  it('does not strip dots for non-Gmail providers', () => {
    expect(canonicalizeEmail('u.s.e.r@outlook.com')).toBe('u.s.e.r@outlook.com');
  });

  it('handles mixed-case Gmail with plus and dots', () => {
    expect(canonicalizeEmail('User.Name+Spam@Gmail.com')).toBe('username@gmail.com');
  });
});

describe('validateAndNormalizeEmail', () => {
  it('accepts a plain valid address and returns both forms', () => {
    const result = validateAndNormalizeEmail('user@example.com');
    expect(result.error).toBeNull();
    expect(result.original).toBe('user@example.com');
    expect(result.canonical).toBe('user@example.com');
  });

  it('preserves the plus tag in original, strips it in canonical', () => {
    const result = validateAndNormalizeEmail('User+weshare@Gmail.com');
    expect(result.error).toBeNull();
    expect(result.original).toBe('User+weshare@Gmail.com');
    expect(result.canonical).toBe('user@gmail.com');
  });

  it('trims whitespace from original', () => {
    const result = validateAndNormalizeEmail('  user@example.com  ');
    expect(result.error).toBeNull();
    expect(result.original).toBe('user@example.com');
  });

  it('rejects an address with no @', () => {
    expect(validateAndNormalizeEmail('notanemail').error).toBe('invalid_format');
  });

  it('rejects an address with no domain', () => {
    expect(validateAndNormalizeEmail('user@').error).toBe('invalid_format');
  });

  it('rejects an address with no TLD', () => {
    expect(validateAndNormalizeEmail('user@domain').error).toBe('invalid_format');
  });

  it('rejects an address with spaces', () => {
    expect(validateAndNormalizeEmail('user @example.com').error).toBe('invalid_format');
  });

  it('rejects an address with multiple @ signs', () => {
    expect(validateAndNormalizeEmail('user@@example.com').error).toBe('invalid_format');
  });

  it('rejects an empty string', () => {
    expect(validateAndNormalizeEmail('').error).toBe('invalid_format');
  });

  it('rejects an address exceeding 254 characters', () => {
    const long = 'a'.repeat(244) + '@example.com';
    expect(validateAndNormalizeEmail(long).error).toBe('invalid_format');
  });

  it('rejects a known disposable domain', () => {
    expect(validateAndNormalizeEmail('flood@mailinator.com').error).toBe('disposable_domain');
  });

  it('rejects a Guerrilla Mail variant', () => {
    expect(validateAndNormalizeEmail('x@guerrillamail.org').error).toBe('disposable_domain');
  });

  it('rejects 10-minute mail', () => {
    expect(validateAndNormalizeEmail('x@10minutemail.com').error).toBe('disposable_domain');
  });

  it('accepts a legitimate provider that happens to contain a disposable name fragment', () => {
    expect(validateAndNormalizeEmail('user@trainmail.io').error).toBeNull();
  });
});
