import type { IPaymentMethod, IPaymentMethodRegistry } from '../core/interfaces/IPaymentMethod';

export class MockPaymentMethodRegistry implements IPaymentMethodRegistry {
  methods: IPaymentMethod[] = [];

  async getAvailable(): Promise<IPaymentMethod[]> {
    return this.methods;
  }
}
