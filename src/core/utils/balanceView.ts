interface BalanceLike {
  userId: string;
  balanceCents: number;
}

interface MemberLike {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export function toBalancesRecord(balances: BalanceLike[]): Record<string, number> {
  return Object.fromEntries(balances.map(b => [b.userId, b.balanceCents]));
}

export function toBalanceBarMembers<M extends MemberLike>(members: M[]): MemberLike[] {
  return members.map(m => ({ userId: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl }));
}
