import type { SplitRequestStatus } from '../models/SplitRequest';

// Only roll over debts that haven't entered a payment flow yet.
const ROLLABLE_STATUSES = new Set<SplitRequestStatus | null>([null, 'owed', 'created']);

export interface RolloverDebtSeed {
  fromUserId: string;            // debtor userId in the TARGET trip
  toUserId: string;              // creditor userId in the TARGET trip
  amountCents: number;
  currency: string;
  rolledOverFromTripId: string;
}

// Structural type — EnrichedSettlement satisfies this without an import cycle.
interface SettlementInput {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currency: string;
  latestRequest: { status: SplitRequestStatus } | null;
}

/**
 * Produces SplitRequest seeds for debts to carry into a new trip.
 * Skips settlements that are paid, in-flight, or whose participants
 * have no mapping in matchMap.
 */
export function computeRolloverDebts(
  settlements: SettlementInput[],
  matchMap: Map<string, string>,
  sourceTripId: string,
): RolloverDebtSeed[] {
  const seeds: RolloverDebtSeed[] = [];

  for (const s of settlements) {
    if (!ROLLABLE_STATUSES.has(s.latestRequest?.status ?? null)) continue;

    const targetFrom = matchMap.get(s.fromUserId);
    const targetTo   = matchMap.get(s.toUserId);
    if (!targetFrom || !targetTo) continue;

    seeds.push({
      fromUserId:           targetFrom,
      toUserId:             targetTo,
      amountCents:          s.amountCents,
      currency:             s.currency,
      rolledOverFromTripId: sourceTripId,
    });
  }

  return seeds;
}
