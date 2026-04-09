export interface Split {
  id: string;
  billId: string;
  participantId: string;
  amountOwed: number;
  amountPaid: number;
  settled: boolean;
}
