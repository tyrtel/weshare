import type { IPaymentMethod, IPaymentMethodRegistry } from '../interfaces/IPaymentMethod';

export class PaymentMethodRegistry implements IPaymentMethodRegistry {
  constructor(private readonly methods: IPaymentMethod[]) {}

  async getAvailable(): Promise<IPaymentMethod[]> {
    const flags = await Promise.all(this.methods.map(m => m.canHandle()));
    return this.methods.filter((_, i) => flags[i]);
  }
}
