export interface Bill {
  id: string;
  title: string;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  /** IDs of Participant records associated with this bill. */
  participants: string[];
  /** IDs of Split records calculated for this bill. */
  splits: string[];
}
