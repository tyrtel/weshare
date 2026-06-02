import { renderHook, act } from '@testing-library/react-native';
import { useSplitForm, type SplitFormEntry } from '../hooks/useSplitForm';
import { memberFactory } from '../../../__testUtils__/factories';

const MEMBERS_2 = [
  memberFactory({ userId: 'jay',   tripId: 't1' }),
  memberFactory({ userId: 'marie', tripId: 't1' }),
];

const MEMBERS_3 = [
  memberFactory({ userId: 'jay',   tripId: 't1' }),
  memberFactory({ userId: 'marie', tripId: 't1' }),
  memberFactory({ userId: 'ana',   tripId: 't1' }),
];

// ── Initialisation ────────────────────────────────────────────────────────────

describe('useSplitForm — initialisation (Add mode)', () => {
  it('initialises all members as included with null custom amounts', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    expect(result.current.splitEntries).toHaveLength(2);
    expect(result.current.splitEntries.every(e => e.included)).toBe(true);
    expect(result.current.splitEntries.every(e => e.customAmountCents === null)).toBe(true);
  });

  it('defaults to equal split mode', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    expect(result.current.splitMode).toBe('equal');
  });

  it('respects initialMode when provided', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000, initialMode: 'custom' }),
    );
    expect(result.current.splitMode).toBe('custom');
  });

  it('does not initialise entries when ready=false', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000, ready: false }),
    );
    expect(result.current.splitEntries).toHaveLength(0);
  });
});

describe('useSplitForm — initialisation (Edit mode)', () => {
  it('pre-fills entries from initialEntries', () => {
    const initialEntries: SplitFormEntry[] = [
      { userId: 'jay',   included: true,  customAmountCents: 700 },
      { userId: 'marie', included: false, customAmountCents: null },
    ];
    const { result } = renderHook(() =>
      useSplitForm({
        members: MEMBERS_2,
        totalAmountCents: 1000,
        initialEntries,
        initialMode: 'custom',
      }),
    );
    expect(result.current.splitEntries).toEqual(initialEntries);
    expect(result.current.splitMode).toBe('custom');
  });

  it('does not initialise when ready=false even if initialEntries are provided', () => {
    const initialEntries: SplitFormEntry[] = [
      { userId: 'jay', included: true, customAmountCents: 500 },
    ];
    const { result } = renderHook(() =>
      useSplitForm({
        members: MEMBERS_2,
        totalAmountCents: 1000,
        initialEntries,
        ready: false,
      }),
    );
    expect(result.current.splitEntries).toHaveLength(0);
  });
});

// ── computedSplits ────────────────────────────────────────────────────────────

describe('useSplitForm — computedSplits (equal mode)', () => {
  it('splits evenly among all included members', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    const amounts = result.current.computedSplits.map(s => s.amountOwedCents);
    expect(amounts).toEqual([500, 500]);
  });

  it('sum of splits equals totalAmountCents', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_3, totalAmountCents: 1000 }),
    );
    const total = result.current.computedSplits.reduce((s, e) => s + e.amountOwedCents, 0);
    expect(total).toBe(1000);
  });
});

describe('useSplitForm — computedSplits (custom mode)', () => {
  it('uses customAmountCents when set; auto-fills the remainder for null entries', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    act(() => { result.current.handleChangeAmount('jay', 700); });

    const jay   = result.current.computedSplits.find(s => s.userId === 'jay');
    const marie = result.current.computedSplits.find(s => s.userId === 'marie');
    expect(jay?.amountOwedCents).toBe(700);
    expect(marie?.amountOwedCents).toBe(300);
  });
});

describe('useSplitForm — computedSplits (proportional mode)', () => {
  it('initial equal weights produce an equal split', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    const total = result.current.computedSplits.reduce((s, e) => s + e.amountOwedCents, 0);
    expect(total).toBe(1000);
    expect(result.current.computedSplits[0].amountOwedCents).toBe(
      result.current.computedSplits[1].amountOwedCents,
    );
  });

  it('reflects weight changes in computed amounts', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    act(() => { result.current.handleChangeWeight('jay', 8000); }); // 80% jay, 20% marie
    const jay   = result.current.computedSplits.find(s => s.userId === 'jay');
    const marie = result.current.computedSplits.find(s => s.userId === 'marie');
    expect(jay?.amountOwedCents).toBeGreaterThan(marie!.amountOwedCents);
    expect((jay?.amountOwedCents ?? 0) + (marie?.amountOwedCents ?? 0)).toBe(1000);
  });
});

// ── remainder / splitIsValid ──────────────────────────────────────────────────

describe('useSplitForm — remainder and splitIsValid', () => {
  it('remainder is 0 and splitIsValid is true in equal mode', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    expect(result.current.remainder).toBe(0);
    expect(result.current.splitIsValid).toBe(true);
  });

  it('remainder is non-zero and splitIsValid is false when custom amounts do not balance', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    act(() => { result.current.handleChangeAmount('jay',   400); });
    act(() => { result.current.handleChangeAmount('marie', 400); });
    expect(result.current.remainder).toBe(200);
    expect(result.current.splitIsValid).toBe(false);
  });

  it('splitIsValid is false when all members are excluded', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleToggleMember('jay'); });
    act(() => { result.current.handleToggleMember('marie'); });
    expect(result.current.splitIsValid).toBe(false);
  });

  it('splitIsValid is false when not yet initialised (ready=false)', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000, ready: false }),
    );
    expect(result.current.splitIsValid).toBe(false);
  });
});

// ── handleSetMode ─────────────────────────────────────────────────────────────

describe('useSplitForm — handleSetMode', () => {
  it('clears customAmountCents when switching away from custom mode', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    act(() => { result.current.handleChangeAmount('jay', 700); });
    act(() => { result.current.handleSetMode('equal'); });
    expect(result.current.splitEntries.every(e => e.customAmountCents === null)).toBe(true);
  });

  it('resets weights to equal when switching to proportional', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    act(() => { result.current.handleChangeWeight('jay', 8000); });
    // Switch back to proportional: weights reset
    act(() => { result.current.handleSetMode('equal'); });
    act(() => { result.current.handleSetMode('proportional'); });
    expect(result.current.weights['jay']).toBe(result.current.weights['marie']);
  });
});

// ── handleToggleMember ────────────────────────────────────────────────────────

describe('useSplitForm — handleToggleMember', () => {
  it('excludes the toggled member from computedSplits', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleToggleMember('marie'); });
    expect(result.current.computedSplits).toHaveLength(1);
    expect(result.current.computedSplits[0].userId).toBe('jay');
  });

  it('re-includes a member when toggled twice', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleToggleMember('marie'); });
    act(() => { result.current.handleToggleMember('marie'); });
    expect(result.current.computedSplits).toHaveLength(2);
  });

  it('resets proportional weights when the included set changes', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_3, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    act(() => { result.current.handleChangeWeight('jay', 8000); });
    act(() => { result.current.handleToggleMember('ana'); }); // included set changes → reset
    expect(result.current.weights['jay']).toBe(result.current.weights['marie']);
  });
});

// ── handleChangeAmount ────────────────────────────────────────────────────────

describe('useSplitForm — handleChangeAmount', () => {
  it('updates the customAmountCents for the specified member', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    act(() => { result.current.handleChangeAmount('jay', 300); });
    const entry = result.current.splitEntries.find(e => e.userId === 'jay');
    expect(entry?.customAmountCents).toBe(300);
  });
});

// ── handleChangeWeight ────────────────────────────────────────────────────────

describe('useSplitForm — handleChangeWeight', () => {
  it('updates the weight and normalises the rest to 10000 bps total', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    act(() => { result.current.handleChangeWeight('jay', 7000); });
    const total = Object.values(result.current.weights).reduce((s, w) => s + w, 0);
    expect(total).toBe(10000);
    expect(result.current.weights['jay']).toBe(7000);
  });
});

// ── getDisplayAmountFor ───────────────────────────────────────────────────────

describe('useSplitForm — getDisplayAmountFor', () => {
  it('returns the computed equal-split amount in equal mode', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    expect(result.current.getDisplayAmountFor('jay')).toBe(500);
  });

  it('returns customAmountCents in custom mode when it is set', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    act(() => { result.current.handleChangeAmount('jay', 700); });
    expect(result.current.getDisplayAmountFor('jay')).toBe(700);
  });

  it('returns auto-computed amount in custom mode when customAmountCents is null', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('custom'); });
    // marie has no custom amount → auto-computed from remainder
    act(() => { result.current.handleChangeAmount('jay', 700); });
    expect(result.current.getDisplayAmountFor('marie')).toBe(300);
  });

  it('returns proportional computed amount regardless of custom amounts', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    act(() => { result.current.handleSetMode('proportional'); });
    // Equal weights → 500 each
    expect(result.current.getDisplayAmountFor('jay')).toBe(500);
  });

  it('returns 0 for an unknown userId', () => {
    const { result } = renderHook(() =>
      useSplitForm({ members: MEMBERS_2, totalAmountCents: 1000 }),
    );
    expect(result.current.getDisplayAmountFor('unknown')).toBe(0);
  });
});
