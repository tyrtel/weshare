// One person's share of one expense.
// amountOwedCents = their portion of the total bill (integer cents — never floats).
// amountPaidCents = how much they've actually paid back.
// settledAt is set when amountPaidCents >= amountOwedCents.

export interface Split {
  id: string;
  expenseId: string;
  userId: string;
  amountOwedCents: number; // integer cents
  amountPaidCents: number; // integer cents
  settledAt?: Date;
}
