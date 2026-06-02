import { equalSplit } from '../hooks/useAddExpense';

export interface SplitResult {
  userId: string;
  amountOwedCents: number;
}

export interface SplitEntry {
  userId: string;
  customAmountCents: number | null;
}

export function computeSplitInputs(
  included: SplitEntry[],
  totalCents: number,
): SplitResult[] {
  if (included.length === 0) return [];
  const custom      = included.filter(e => e.customAmountCents !== null);
  const auto        = included.filter(e => e.customAmountCents === null);
  const customTotal = custom.reduce((s, e) => s + (e.customAmountCents ?? 0), 0);
  const autoShares  = equalSplit(totalCents - customTotal, auto.map(e => e.userId));
  const autoMap     = new Map(autoShares.map(s => [s.userId, s.amountOwedCents]));
  return included.map(e => ({
    userId: e.userId,
    amountOwedCents: e.customAmountCents !== null ? e.customAmountCents : (autoMap.get(e.userId) ?? 0),
  }));
}

export function computeProportionalSplits(
  includedUserIds: string[],
  weights: Record<string, number>,
  totalCents: number,
): SplitResult[] {
  if (includedUserIds.length === 0) return [];
  const totalWeight = includedUserIds.reduce((s, id) => s + (weights[id] ?? 0), 0);
  if (totalWeight === 0) return equalSplit(totalCents, includedUserIds);

  const splits = includedUserIds.map(id => ({
    userId: id,
    amountOwedCents: Math.round(totalCents * (weights[id] ?? 0) / totalWeight),
  }));

  // Absorb rounding remainder into the first member.
  const splitSum = splits.reduce((s, e) => s + e.amountOwedCents, 0);
  splits[0].amountOwedCents += totalCents - splitSum;

  return splits;
}

/**
 * When one member's weight changes to `newWeight`, redistribute the remaining
 * 10000 bps among the other included members proportionally to their current weights.
 */
export function normaliseWeights(
  weights: Record<string, number>,
  changedId: string,
  newWeight: number,
  includedIds: string[],
): Record<string, number> {
  const others    = includedIds.filter(id => id !== changedId);
  const othersSum = others.reduce((s, id) => s + (weights[id] ?? 0), 0);
  const remaining = 10000 - newWeight;
  const next: Record<string, number> = { ...weights, [changedId]: newWeight };

  if (others.length === 0) return next;

  if (othersSum === 0) {
    const share = Math.floor(remaining / others.length);
    const rem   = remaining - share * others.length;
    others.forEach((id, i) => { next[id] = share + (i === others.length - 1 ? rem : 0); });
  } else {
    let assigned = 0;
    others.forEach((id, i) => {
      if (i === others.length - 1) {
        next[id] = remaining - assigned;
      } else {
        const w = Math.round((weights[id] ?? 0) * remaining / othersSum);
        next[id] = w;
        assigned += w;
      }
    });
  }

  return next;
}

// ── Dirty-aware weight normalisation ─────────────────────────────────────────

function _distributeProportional(
  next: Record<string, number>,
  ids: string[],
  prevWeights: Record<string, number>,
  total: number,
): void {
  if (ids.length === 0) return;
  const sum = ids.reduce((s, id) => s + (prevWeights[id] ?? 0), 0);
  if (sum === 0) {
    _distributeEqual(next, ids, total);
    return;
  }
  let assigned = 0;
  ids.forEach((id, i) => {
    if (i === ids.length - 1) {
      next[id] = Math.max(0, total - assigned);
    } else {
      const w = Math.round((prevWeights[id] ?? 0) * total / sum);
      next[id] = Math.max(0, w);
      assigned += next[id];
    }
  });
}

function _distributeEqual(
  next: Record<string, number>,
  ids: string[],
  total: number,
): void {
  if (ids.length === 0) return;
  const safe  = Math.max(0, total);
  const share = Math.floor(safe / ids.length);
  const rem   = safe - share * ids.length;
  ids.forEach((id, i) => {
    next[id] = share + (i === ids.length - 1 ? rem : 0);
  });
}

/**
 * Like `normaliseWeights` but respects a dirty set.
 *
 * Priority when redistibuting:
 *  1. Non-dirty members absorb the change first (proportional to each other).
 *  2. If non-dirty would go below 0, floor them there and take the remainder
 *     equally from dirty members.
 *  3. If there are no non-dirty members, share equally among dirty.
 */
export function normaliseWeightsWithDirty(
  weights: Record<string, number>,
  changedId: string,
  newWeight: number,
  includedIds: string[],
  dirtyIds: Set<string>,
): Record<string, number> {
  const others   = includedIds.filter(id => id !== changedId);
  const nonDirty = others.filter(id => !dirtyIds.has(id));
  const dirty    = others.filter(id => dirtyIds.has(id));
  const next: Record<string, number> = { ...weights, [changedId]: newWeight };

  if (others.length === 0) return next;

  const needed = 10000 - newWeight;

  if (nonDirty.length === 0) {
    _distributeEqual(next, dirty, needed);
    return next;
  }

  const dirtySum       = dirty.reduce((s, id) => s + (weights[id] ?? 0), 0);
  const nonDirtyTarget = needed - dirtySum;

  if (nonDirtyTarget >= 0) {
    _distributeProportional(next, nonDirty, weights, nonDirtyTarget);
  } else {
    // Non-dirty can't absorb the full change — floor them at 0.
    nonDirty.forEach(id => { next[id] = 0; });
    _distributeEqual(next, dirty, needed);
  }

  return next;
}

/** Equal distribution of 10000 bps across the given user IDs. */
export function initialWeights(userIds: string[]): Record<string, number> {
  if (userIds.length === 0) return {};
  const base   = Math.floor(10000 / userIds.length);
  const rem    = 10000 - base * userIds.length;
  const result: Record<string, number> = {};
  userIds.forEach((id, i) => { result[id] = base + (i === userIds.length - 1 ? rem : 0); });
  return result;
}
