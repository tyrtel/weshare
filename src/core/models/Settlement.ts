// Computed, not stored. Output of the settlement algorithm.
// Represents the minimal set of transfers needed to clear all debts in a trip.

export interface Settlement {
  fromUserId: string;
  toUserId: string;
  amountCents: number; // integer cents
  currency: string;
}
