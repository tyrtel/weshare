import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { palette, type, radius, space } from '../theme';
import { TRIPS, MEMBERS, ME, Expense } from '../data/mock';
import { Screen, Card, SectionHeader, Avatar, Money, PrimaryButton, Hairline } from '../components/ui';
import { LedgerBars } from '../components/LedgerBars';

// Compute each participant's net position for the trip from its expenses.
// (In the real app this lives in your store/selectors; shown here so the
// screen is honest about where numbers come from.)
export function tripBalances(expenses: Expense[], participantIds: string[]) {
  const net: Record<string, number> = Object.fromEntries(participantIds.map(id => [id, 0]));
  for (const e of expenses) {
    net[e.payerId] += e.amount;
    const shares = expenseShares(e);
    for (const [id, share] of Object.entries(shares)) net[id] -= share;
  }
  return net;
}

export function expenseShares(e: Expense): Record<string, number> {
  const out: Record<string, number> = {};
  const { split } = e;
  if (split.mode === 'even' && split.participants) {
    const share = Math.floor(e.amount / split.participants.length);
    let rem = e.amount - share * split.participants.length;
    for (const id of split.participants) out[id] = share + (rem-- > 0 ? 1 : 0);
  } else if (split.mode === 'proportion' && split.weights) {
    const total = Object.values(split.weights).reduce((a, b) => a + b, 0);
    let acc = 0; const ids = Object.keys(split.weights);
    ids.forEach((id, i) => {
      const v = i === ids.length - 1 ? e.amount - acc : Math.round(e.amount * split.weights![id] / total);
      out[id] = v; acc += v;
    });
  } else if (split.mode === 'exact' && split.amounts) {
    Object.assign(out, split.amounts);
  } else if (split.mode === 'itemized' && split.items) {
    for (const item of split.items) {
      const share = Math.floor(item.amount / item.assignees.length);
      let rem = item.amount - share * item.assignees.length;
      for (const id of item.assignees) out[id] = (out[id] ?? 0) + share + (rem-- > 0 ? 1 : 0);
    }
  }
  return out;
}

const SPLIT_LABEL: Record<string, string> = {
  even: 'split evenly', proportion: 'split by shares',
  exact: 'exact amounts', itemized: 'itemized',
};

export default function TripScreen({ route, navigation }: any) {
  const trip = TRIPS.find(t => t.id === route.params?.tripId) ?? TRIPS[0];
  const balances = useMemo(() => tripBalances(trip.expenses, trip.participantIds), [trip]);
  const total = trip.expenses.reduce((s, e) => s + e.amount, 0);
  const perHead = trip.participantIds.length ? Math.round(total / trip.participantIds.length) : 0;

  const invite = () =>
    Share.share({ message: `Join "${trip.name}" on Even: https://even.app/j/t/${trip.id}?code=K7F2Q` });

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={palette.ink} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>{trip.emoji}  {trip.name}</Text>
          <Text style={styles.dates}>{trip.dates}</Text>
        </View>
        <Pressable hitSlop={10}><Feather name="edit-2" size={18} color={palette.inkSoft} /></Pressable>
      </View>

      {/* Spend summary */}
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Trip total</Text>
            <Money cents={total} size={22} />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Per person</Text>
            <Money cents={perHead} size={22} />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Your net</Text>
            <Money cents={balances[ME] ?? 0} sign size={22}
              color={(balances[ME] ?? 0) >= 0 ? palette.owed : palette.owes} />
          </View>
        </View>
        <Hairline />
        <LedgerBars balances={balances} members={MEMBERS} />
        <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(3) }}>
          <PrimaryButton label="Settle trip" icon="check-circle" />
        </View>
      </Card>

      {/* Participants with deep-link invite */}
      <SectionHeader title="Participants" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), flexWrap: 'wrap' }}>
        {trip.participantIds.map(id => (
          <Pressable key={id} style={{ alignItems: 'center', gap: 4 }}>
            <Avatar m={MEMBERS[id]} size={44} />
            <Text style={styles.pName}>{MEMBERS[id].name}</Text>
          </Pressable>
        ))}
        <Pressable style={{ alignItems: 'center', gap: 4 }} onPress={invite}>
          <View style={styles.inviteCircle}>
            <Feather name="user-plus" size={18} color={palette.spruce} />
          </View>
          <Text style={[styles.pName, { color: palette.spruce }]}>Invite</Text>
        </Pressable>
      </Card>

      {/* Expenses */}
      <SectionHeader title="Expenses" action="Add"
        onAction={() => navigation.navigate('AddExpense', { tripId: trip.id })} />
      <Card style={{ paddingVertical: space(1) }}>
        {trip.expenses.map((e, i) => {
          const payer = MEMBERS[e.payerId];
          return (
            <View key={e.id}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable style={styles.expenseRow}
                onPress={() => navigation.navigate('AddExpense', { expenseId: e.id, tripId: trip.id })}>
                <View style={styles.iconTile}>
                  <Feather name={e.icon as any} size={16} color={palette.spruce} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expTitle}>{e.title}</Text>
                  <Text style={styles.expMeta}>
                    {payer.id === ME ? 'You' : payer.name} paid · {SPLIT_LABEL[e.split.mode]} · {e.date}
                  </Text>
                </View>
                <Money cents={e.amount} size={15} />
              </Pressable>
            </View>
          );
        })}
        {trip.expenses.length === 0 && (
          <Text style={styles.empty}>No expenses yet. Add the first one.</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space(4),
  },
  title: { fontFamily: type.display, fontSize: 20, color: palette.ink, letterSpacing: -0.3 },
  dates: { fontFamily: type.body, fontSize: 12, color: palette.inkSoft, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: {
    fontFamily: type.bodyMed, fontSize: 11, color: palette.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  statDivider: { width: 1, height: 34, backgroundColor: palette.line },
  pName: { fontFamily: type.bodyMed, fontSize: 12, color: palette.ink },
  inviteCircle: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: palette.spruce, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.spruceTint,
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  divider: { height: 1, backgroundColor: palette.line, marginLeft: 48 },
  iconTile: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.spruceTint,
    alignItems: 'center', justifyContent: 'center',
  },
  expTitle: { fontFamily: type.bodyMed, fontSize: 14.5, color: palette.ink },
  expMeta: { fontFamily: type.body, fontSize: 12, color: palette.inkSoft, marginTop: 2 },
  empty: { fontFamily: type.body, fontSize: 13, color: palette.inkFaint, padding: space(3) },
});
