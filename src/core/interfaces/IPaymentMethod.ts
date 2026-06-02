import type { SplitRequest } from '../models/SplitRequest';
import type { ISplitRequestRepository } from './ISplitRequestRepository';

export interface PaymentMethodMeta {
  key:          string;
  label:        string;
  description:  string;
  iconName:     string;
  iconBg?:      string;
  iconColor?:   string;
}

export interface PaymentLaunchParams {
  tripId:          string;
  payerUserId:     string;
  requesterUserId: string;
  amountCents:     number;
  currency:        string;
  recipientName:   string;
  note:            string;
  navigate: (path: string, params: Record<string, string>) => void;
}

export interface IPaymentMethod {
  readonly meta: PaymentMethodMeta;
  canHandle(): Promise<boolean>;
  launch(params: PaymentLaunchParams, repo: ISplitRequestRepository): Promise<SplitRequest | null>;
}

export interface IPaymentMethodRegistry {
  getAvailable(): Promise<IPaymentMethod[]>;
}
