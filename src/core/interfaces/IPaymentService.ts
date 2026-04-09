export interface PaymentRequest {
  /** The recipient's handle on the payment platform (e.g. "@alice"). */
  recipientHandle: string;
  amount: number;
  currency: string;
  note: string;
}

export interface IPaymentService {
  /** Human-readable name of the provider, e.g. "Venmo" or "Revolut". */
  readonly providerName: string;
  /** Returns a deep-link URL without opening it — useful for previews and tests. */
  generateDeepLink(request: PaymentRequest): string;
  /** Builds the deep-link and hands off to the OS to open the payment app. */
  openPayment(request: PaymentRequest): Promise<void>;
  /** Returns true if the target app is installed and can handle the deep-link. */
  isAvailable(): Promise<boolean>;
}
