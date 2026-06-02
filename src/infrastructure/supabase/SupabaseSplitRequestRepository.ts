import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { ISplitRequestRepository } from '../../core/interfaces/ISplitRequestRepository';
import type { SplitRequest, SplitRequestStatus } from '../../core/models/SplitRequest';
import type { PaymentProvider } from '../../core/interfaces/IPaymentService';
import type { OBProvider } from '../../core/interfaces/IOpenBankingService';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseSplitRequestRow, mapRows } from './rowSchemas';

function rowToSplitRequest(raw: unknown): Result<SplitRequest, AppError> {
  const parsed = parseSplitRequestRow(raw);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  return ok({
    id:                  row.id,
    tripId:              row.trip_id,
    requesterUserId:     row.requester_user_id,
    payerUserId:         row.payer_user_id,
    amountCents:         row.amount_cents,
    currency:            row.currency,
    note:                row.note,
    status:              row.status as SplitRequestStatus,
    preferredWallet:     row.preferred_wallet as PaymentProvider,
    externalRefId:       row.external_ref_id,
    stripePaymentLinkId: row.stripe_payment_link_id,
    stripeSessionId:     row.stripe_session_id,
    obPaymentId:             row.ob_payment_id,
    obProvider:              row.ob_provider as OBProvider | null,
    rolledOverFromTripId:    row.rolled_over_from_trip_id ?? null,
    createdAt:               new Date(row.created_at),
    updatedAt:               new Date(row.updated_at),
  });
}

export class SupabaseSplitRequestRepository implements ISplitRequestRepository {
  async getSplitRequest(id: string): Promise<Result<SplitRequest, AppError>> {
    const { data, error } = await supabase
      .from('split_requests')
      .select()
      .eq('id', id)
      .single();
    if (error) return err(toAppError(error, 'SplitRequest', id));
    return rowToSplitRequest(data);
  }

  async getSplitRequestsForTrip(tripId: string): Promise<Result<SplitRequest[], AppError>> {
    const { data, error } = await supabase
      .from('split_requests')
      .select()
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return err(toAppError(error, 'SplitRequest'));
    return mapRows(data as unknown[], rowToSplitRequest);
  }

  async saveSplitRequest(req: SplitRequest): Promise<Result<SplitRequest, AppError>> {
    const { data, error } = await supabase
      .from('split_requests')
      .insert({
        id:                     req.id,
        trip_id:                req.tripId,
        requester_user_id:      req.requesterUserId,
        payer_user_id:          req.payerUserId,
        amount_cents:           req.amountCents,
        currency:               req.currency,
        note:                   req.note,
        status:                 req.status,
        preferred_wallet:       req.preferredWallet,
        external_ref_id:           req.externalRefId,
        stripe_payment_link_id:    req.stripePaymentLinkId,
        stripe_session_id:         req.stripeSessionId,
        ob_payment_id:             req.obPaymentId,
        ob_provider:               req.obProvider,
        rolled_over_from_trip_id:  req.rolledOverFromTripId,
      })
      .select()
      .single();
    if (error) return err(toAppError(error, 'SplitRequest', req.id));
    return rowToSplitRequest(data);
  }

  async updateSplitRequest(req: SplitRequest): Promise<Result<SplitRequest, AppError>> {
    const { data, error } = await supabase
      .from('split_requests')
      .update({
        status:                 req.status,
        preferred_wallet:       req.preferredWallet,
        external_ref_id:        req.externalRefId,
        stripe_payment_link_id: req.stripePaymentLinkId,
        stripe_session_id:      req.stripeSessionId,
        ob_payment_id:          req.obPaymentId,
        ob_provider:            req.obProvider,
        note:                   req.note,
        updated_at:             new Date().toISOString(),
      })
      .eq('id', req.id)
      .select()
      .single();
    if (error) return err(toAppError(error, 'SplitRequest', req.id));
    return rowToSplitRequest(data);
  }
}
