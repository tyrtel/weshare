import { DeepLinkPaymentService } from '../services/DeepLinkPaymentService';

describe('DeepLinkPaymentService', () => {
  const service = new DeepLinkPaymentService();

  it('builds a Revolut deep-link URL', () => {
    const url = service.buildPaymentLink('revolut', 4800, 'EUR', 'jay123');
    expect(url).toContain('revolut://pay');
    expect(url).toContain('recipient=jay123');
    expect(url).toContain('amount=48.00');
    expect(url).toContain('currency=EUR');
  });

  it('builds a Venmo deep-link URL', () => {
    const url = service.buildPaymentLink('venmo', 2500, 'USD', 'mariepays');
    expect(url).toContain('venmo://paycharge');
    expect(url).toContain('recipients=mariepays');
    expect(url).toContain('amount=25.00');
  });

  it('builds an "other" HTTPS fallback URL', () => {
    const url = service.buildPaymentLink('other', 1000, 'GBP', 'sara');
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('to=sara');
    expect(url).toContain('amount=10.00');
    expect(url).toContain('currency=GBP');
  });

  it('correctly converts integer cents to decimal amount', () => {
    // 14800 cents = €148.00
    const url = service.buildPaymentLink('revolut', 14800, 'EUR', 'tom');
    expect(url).toContain('amount=148.00');
  });

  it('URL-encodes handles with special characters', () => {
    const url = service.buildPaymentLink('revolut', 500, 'EUR', 'user@name');
    expect(url).toContain('recipient=user%40name');
  });

  it('formats single-digit cent amounts correctly (e.g. 1 cent = 0.01)', () => {
    const url = service.buildPaymentLink('venmo', 1, 'USD', 'test');
    expect(url).toContain('amount=0.01');
  });

  it('throws for zero amountCents', () => {
    expect(() => service.buildPaymentLink('revolut', 0, 'EUR', 'jay')).toThrow();
  });

  it('throws for negative amountCents', () => {
    expect(() => service.buildPaymentLink('revolut', -100, 'EUR', 'jay')).toThrow();
  });

  it('throws for NaN amountCents', () => {
    expect(() => service.buildPaymentLink('revolut', NaN, 'EUR', 'jay')).toThrow();
  });

  it('throws for Infinity amountCents', () => {
    expect(() => service.buildPaymentLink('revolut', Infinity, 'EUR', 'jay')).toThrow();
  });
});
