import type { Settlement } from '../../../core/models/Settlement';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { ReportSettlementEntry } from '../../../core/models/Report';

interface NamedMember {
  userId: string;
  displayName: string;
}

// Same "latest request per pair" pattern as useSettlement's EnrichedSettlement
// — the SplitRequest ledger is the only live source of truth for whether a
// pairwise debt has been paid (see Report.ts's ReportSettlementEntry comment).
export function enrichSettlements(
  settlements: Settlement[],
  members: NamedMember[],
  splitRequests: SplitRequest[],
): ReportSettlementEntry[] {
  const nameMap = new Map(members.map(m => [m.userId, m.displayName]));

  const requestMap = new Map<string, SplitRequest>();
  for (const req of splitRequests) {
    const key  = `${req.payerUserId}:${req.requesterUserId}`;
    const prev = requestMap.get(key);
    if (!prev || req.createdAt > prev.createdAt) requestMap.set(key, req);
  }

  return settlements.map(s => ({
    fromDisplayName: nameMap.get(s.fromUserId) ?? s.fromUserId,
    toDisplayName:   nameMap.get(s.toUserId)   ?? s.toUserId,
    amountCents:     s.amountCents,
    currency:        s.currency,
    status:          requestMap.get(`${s.fromUserId}:${s.toUserId}`)?.status ?? 'outstanding',
  }));
}
