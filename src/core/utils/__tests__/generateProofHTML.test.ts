import { generateProofHTML } from '../generateProofHTML';
import type { SplitRequest } from '../../models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

const NOW = new Date('2025-12-25T12:00:00Z');

describe('generateProofHTML', () => {
  it('returns a valid HTML document', () => {
    const html = generateProofHTML(splitRequestFactory());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the formatted amount', () => {
    const html = generateProofHTML(splitRequestFactory({ amountCents: 5000, currency: 'EUR' }));
    expect(html).toContain('50');
  });

  it('labels Stripe when stripeSessionId is set', () => {
    const html = generateProofHTML(splitRequestFactory({ stripeSessionId: 'cs_test_abc' }));
    expect(html).toContain('Stripe');
  });

  it('labels SEPA Bank Transfer when obPaymentId is set', () => {
    const html = generateProofHTML(splitRequestFactory({ obPaymentId: 'tink_pay_123' }));
    expect(html).toContain('SEPA Bank Transfer');
  });

  it('labels Revolut for preferredWallet=revolut', () => {
    const html = generateProofHTML(splitRequestFactory({ preferredWallet: 'revolut' }));
    expect(html).toContain('Revolut');
  });

  it('labels Venmo for preferredWallet=venmo', () => {
    const html = generateProofHTML(splitRequestFactory({ preferredWallet: 'venmo' }));
    expect(html).toContain('Venmo');
  });

  it('labels Other for unknown wallet', () => {
    const html = generateProofHTML(splitRequestFactory({ preferredWallet: 'other' }));
    expect(html).toContain('Other');
  });

  it('includes payer and payee names from options', () => {
    const html = generateProofHTML(splitRequestFactory(), { payerName: 'Alice', payeeName: 'Bob' });
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('defaults to Payer/Payee when options are omitted', () => {
    const html = generateProofHTML(splitRequestFactory());
    expect(html).toContain('Payer');
    expect(html).toContain('Payee');
  });

  it('includes the reference section when stripeSessionId is set', () => {
    const html = generateProofHTML(splitRequestFactory({ stripeSessionId: 'cs_test_xyz' }));
    expect(html).toContain('Reference');
    expect(html).toContain('cs_test_xyz');
  });

  it('omits the reference section when no reference is available', () => {
    const html = generateProofHTML(splitRequestFactory());
    expect(html).not.toContain('Reference');
  });

  it('prefers stripePaymentLinkId over stripeSessionId as reference', () => {
    const html = generateProofHTML(splitRequestFactory({
      stripePaymentLinkId: 'pl_linkId',
      stripeSessionId:     'cs_sessionId',
    }));
    expect(html).toContain('pl_linkId');
    expect(html).not.toContain('cs_sessionId');
  });

  it('shows note when present', () => {
    const html = generateProofHTML(splitRequestFactory({ note: 'Sushi night' }));
    expect(html).toContain('Sushi night');
  });

  it('shows em-dash when note is empty string', () => {
    const html = generateProofHTML(splitRequestFactory({ note: '' }));
    expect(html).toContain('—');
  });
});
