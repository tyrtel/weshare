import { PaymentMethodRegistry } from '../PaymentMethodRegistry';
import type { IPaymentMethod, PaymentLaunchParams } from '../../interfaces/IPaymentMethod';
import type { ISplitRequestRepository } from '../../interfaces/ISplitRequestRepository';
import type { SplitRequest } from '../../models/SplitRequest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMethod(
  key: string,
  available: boolean,
): IPaymentMethod & { launchCalls: number } {
  return {
    meta: { key, label: key, description: '', iconName: 'card' },
    canHandle: jest.fn().mockResolvedValue(available),
    launch: jest.fn().mockResolvedValue(null),
    launchCalls: 0,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PaymentMethodRegistry', () => {
  it('returns only methods where canHandle() resolves true', async () => {
    const revolut = makeMethod('revolut', true);
    const venmo   = makeMethod('venmo',   false);
    const stripe  = makeMethod('stripe',  true);

    const registry = new PaymentMethodRegistry([revolut, venmo, stripe]);
    const available = await registry.getAvailable();

    expect(available).toHaveLength(2);
    expect(available[0].meta.key).toBe('revolut');
    expect(available[1].meta.key).toBe('stripe');
  });

  it('returns an empty array when no methods are available', async () => {
    const registry = new PaymentMethodRegistry([
      makeMethod('revolut', false),
      makeMethod('venmo',   false),
    ]);
    expect(await registry.getAvailable()).toEqual([]);
  });

  it('returns all methods when all are available', async () => {
    const methods = ['a', 'b', 'c'].map(k => makeMethod(k, true));
    const registry = new PaymentMethodRegistry(methods);
    const available = await registry.getAvailable();
    expect(available).toHaveLength(3);
  });

  it('returns an empty array when constructed with no methods', async () => {
    const registry = new PaymentMethodRegistry([]);
    expect(await registry.getAvailable()).toEqual([]);
  });

  it('calls canHandle on every registered method', async () => {
    const a = makeMethod('a', true);
    const b = makeMethod('b', false);
    const registry = new PaymentMethodRegistry([a, b]);

    await registry.getAvailable();

    expect(a.canHandle).toHaveBeenCalledTimes(1);
    expect(b.canHandle).toHaveBeenCalledTimes(1);
  });

  it('checks availability in parallel (all canHandle called before filtering)', async () => {
    const order: string[] = [];
    const slow: IPaymentMethod = {
      meta: { key: 'slow', label: '', description: '', iconName: 'card' },
      canHandle: jest.fn(() => new Promise<boolean>(res => setTimeout(() => { order.push('slow'); res(true); }, 10))),
      launch: jest.fn<Promise<SplitRequest | null>, [PaymentLaunchParams, ISplitRequestRepository]>().mockResolvedValue(null),
    };
    const fast: IPaymentMethod = {
      meta: { key: 'fast', label: '', description: '', iconName: 'card' },
      canHandle: jest.fn(() => { order.push('fast-called'); return Promise.resolve(true); }),
      launch: jest.fn<Promise<SplitRequest | null>, [PaymentLaunchParams, ISplitRequestRepository]>().mockResolvedValue(null),
    };

    const registry = new PaymentMethodRegistry([slow, fast]);
    const available = await registry.getAvailable();

    // Both were started; fast resolved before slow in the order array.
    expect(available).toHaveLength(2);
    expect(order[0]).toBe('fast-called');
  });
});
