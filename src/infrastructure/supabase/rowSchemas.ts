import { z } from 'zod';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';

// ── Per-table Zod schemas ─────────────────────────────────────────────────────

const tripRowSchema = z.object({
  id:           z.string().min(1),
  name:         z.string().min(1),
  currency:     z.string().min(1),
  owner_id:     z.string().min(1),
  created_at:   z.string(),
  invite_token: z.string().nullable(),
  status:       z.enum(['active', 'settling', 'closed']).default('active'),
  closed_at:    z.string().nullable().default(null),
});

const memberRowSchema = z.object({
  trip_id:      z.string().min(1),
  user_id:      z.string().min(1),
  display_name: z.string().min(1),
  is_guest:     z.boolean(),
  joined_at:    z.string(),
  phone:        z.string().nullable().optional(),
  email:        z.string().nullable().optional(),
});

const expenseRowSchema = z.object({
  id:                 z.string().min(1),
  trip_id:            z.string().min(1),
  description:        z.string().min(1),
  total_amount_cents: z.number().int(),
  currency:           z.string().min(1),
  paid_by_user_id:    z.string().min(1),
  created_at:         z.string(),
  metadata:           z.record(z.unknown()).default({}),
});

const splitRowSchema = z.object({
  id:                z.string().min(1),
  expense_id:        z.string().min(1),
  user_id:           z.string().min(1),
  amount_owed_cents: z.number().int(),
  amount_paid_cents: z.number().int(),
  settled_at:        z.string().nullable(),
});

const splitRequestRowSchema = z.object({
  id:                     z.string().min(1),
  trip_id:                z.string().min(1),
  requester_user_id:      z.string().min(1),
  payer_user_id:          z.string().min(1),
  amount_cents:           z.number().int(),
  currency:               z.string().min(1),
  note:                   z.string(),
  status:                 z.string(),
  preferred_wallet:       z.string(),
  external_ref_id:        z.string().nullable(),
  stripe_payment_link_id: z.string().nullable(),
  stripe_session_id:      z.string().nullable(),
  ob_payment_id:              z.string().nullable(),
  ob_provider:                z.string().nullable(),
  rolled_over_from_trip_id:   z.string().nullable().default(null),
  created_at:                 z.string(),
  updated_at:                 z.string(),
});

// ── Inferred row types ────────────────────────────────────────────────────────

export type TripRowParsed          = z.infer<typeof tripRowSchema>;
export type MemberRowParsed        = z.infer<typeof memberRowSchema>;
export type ExpenseRowParsed       = z.infer<typeof expenseRowSchema>;
export type SplitRowParsed         = z.infer<typeof splitRowSchema>;
export type SplitRequestRowParsed  = z.infer<typeof splitRequestRowSchema>;

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parseRow<T>(
  schema: z.ZodSchema<T>,
  raw: unknown,
  resource: string,
): Result<T, AppError> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return err({
      kind:    'ValidationError',
      field:   first?.path.join('.') ?? resource,
      message: first?.message ?? `Invalid ${resource} row`,
    });
  }
  return ok(result.data);
}

export function parseTripRow(raw: unknown): Result<TripRowParsed, AppError> {
  return parseRow(tripRowSchema, raw, 'Trip');
}

export function parseMemberRow(raw: unknown): Result<MemberRowParsed, AppError> {
  return parseRow(memberRowSchema, raw, 'TripMember');
}

export function parseExpenseRow(raw: unknown): Result<ExpenseRowParsed, AppError> {
  return parseRow(expenseRowSchema, raw, 'Expense');
}

export function parseSplitRow(raw: unknown): Result<SplitRowParsed, AppError> {
  return parseRow(splitRowSchema, raw, 'Split');
}

export function parseSplitRequestRow(raw: unknown): Result<SplitRequestRowParsed, AppError> {
  return parseRow(splitRequestRowSchema, raw, 'SplitRequest');
}

// ── Array helper ──────────────────────────────────────────────────────────────

export function mapRows<T>(
  rows: unknown[],
  mapper: (raw: unknown) => Result<T, AppError>,
): Result<T[], AppError> {
  const out: T[] = [];
  for (const row of rows) {
    const result = mapper(row);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return ok(out);
}
