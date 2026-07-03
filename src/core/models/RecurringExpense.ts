export type RecurrencePeriod = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export interface RecurringExpenseSplit {
  id:                 string;
  recurringExpenseId: string;
  userId:             string;
  amountOwedCents:    number;
}

export interface RecurringExpense {
  id:               string;
  groupId:          string;
  description:      string;
  totalAmountCents: number;
  currency:         string;
  paidByUserId:     string;
  period:           RecurrencePeriod;
  startDate:        Date;
  nextDueAt:        Date;
  lastSpawnedAt:    Date | null;
  pausedAt:         Date | null;
  createdAt:        Date;
  createdByUserId:  string;
  splits:           RecurringExpenseSplit[];
}
