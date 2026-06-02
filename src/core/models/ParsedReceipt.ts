export type ParsedReceiptLineItem = {
  description: string;
  amountCents: number;
};

export type ParsedReceipt = {
  merchant: string | null;
  date: string | null;        // ISO 8601, e.g. "2026-05-14"
  currency: string;           // 3-letter ISO 4217 code, e.g. "EUR"
  totalAmountCents: number;
  lineItems: ParsedReceiptLineItem[];
};
