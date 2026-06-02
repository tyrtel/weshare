import { z } from 'zod';
import { ok, err } from '../types/Result';
import type { Result } from '../types/Result';
import type { ValidationError } from '../types/AppError';

// ---------------------------------------------------------------------------
// Leaf schemas — no dependencies on other schemas
// ---------------------------------------------------------------------------

export const splitSchema = z.object({
  id: z.string(),
  expenseId: z.string(),
  userId: z.string(),
  amountOwedCents: z.number().int(),
  amountPaidCents: z.number().int(),
  settledAt: z.coerce.date().optional(),
});

export const tripMemberSchema = z.object({
  userId: z.string(),
  tripId: z.string(),
  displayName: z.string(),
  joinedAt: z.coerce.date(),
  isGuest: z.boolean(),
});

export const settlementSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
  createdAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Expense — depends on splitSchema
// ---------------------------------------------------------------------------

export const expenseLineItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  amountCents: z.number().int(),
  assignedUserIds: z.array(z.string()),
});

export const expenseMetadataSchema = z.object({
  notes: z.string().optional(),
  receiptUrl: z.string().optional(),
  lineItems: z.array(expenseLineItemSchema).optional(),
  category: z.string().optional(),
});

export const expenseSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  description: z.string(),
  totalAmountCents: z.number().int(),
  currency: z.string(),
  paidByUserId: z.string(),
  createdAt: z.coerce.date(),
  splits: z.array(splitSchema),
  metadata: expenseMetadataSchema,
});

// ---------------------------------------------------------------------------
// Trip — depends on tripMemberSchema
// ---------------------------------------------------------------------------

export const tripSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  createdAt: z.coerce.date(),
  ownerId: z.string(),
  members: z.array(tripMemberSchema),
  inviteToken: z.string().optional(),
  status: z.enum(['active', 'settling', 'closed']).default('active'),
  closedAt: z.coerce.date().nullable().default(null),
});

// ---------------------------------------------------------------------------
// Inferred output types — used by the store's rehydration validator
// ---------------------------------------------------------------------------

export type SplitOutput = z.infer<typeof splitSchema>;
export type TripMemberOutput = z.infer<typeof tripMemberSchema>;
export type ExpenseOutput = z.infer<typeof expenseSchema>;
export type TripOutput = z.infer<typeof tripSchema>;
export type SettlementOutput = z.infer<typeof settlementSchema>;
export type UserOutput = z.infer<typeof userSchema>;

// ---------------------------------------------------------------------------
// safeParse — wraps Zod's safeParse in the project's Result type.
// The first Zod issue's path + message become the ValidationError fields.
// Returns Ok<T> on success, Err<ValidationError> on failure.
// ---------------------------------------------------------------------------

export function safeParse<T>(
  schema: z.ZodType<T>,
  data: unknown,
): Result<T, ValidationError> {
  const result = schema.safeParse(data);
  if (result.success) {
    return ok(result.data);
  }
  const first = result.error.issues[0];
  return err<ValidationError>({
    kind: 'ValidationError',
    field: first?.path.join('.') ?? 'unknown',
    message: first?.message ?? 'Validation failed',
  });
}
