import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { palette, type, radius, space } from '../theme';
import { GROUPS, TRIPS, MEMBERS, ME } from '../data/mock';
import { Screen, Card, SectionHeader, Avatar, Money, PrimaryButton, Hairline } from '../components/ui';
import { LedgerBars } from '../components/LedgerBars';

export default function GroupScreen({ route, navigation }: any) {
  const group = GROUPS.find(g => g.id === route.params?.groupId) ?? GROUPS[0];
  const trips = TRIPS.filter(t => group.tripIds.includes(t.id));

  return (
    <Screen>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={palette.ink} />
        </Pressable>
        <Text style={styles.title}>{group.emoji}  {group.name}</Text>
        <Pressable hitSlop={10}>
          <Feather name="settings" size={20} color={palette.inkSoft} />
        </Pressable>
      </View>

      {/* Ledger — who owes / is owed */}
      <Card>
        <Text style={styles.ledgerLabel}>Balances</Text>
        <LedgerBars balances={group.balances} members={MEMBERS} />
        <Hairline />
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <PrimaryButton label="Settle up" icon="check-circle" />
          <PrimaryButton label="Remind" icon="bell" tone="ghost" />
        </View>
      </Card>

      {/* Recurring */}
      {group.recurring.length > 0 && (
        <>
          <SectionHeader title="Recurring" action="Add" />
          <Card style={{ paddingVertical: space(1) }}>
            {group.recurring.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable style={styles.expenseRow}>
                  <View style={styles.iconTile}>
                    <Feather name={r.icon as any} size={16} color={palette.spruce} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expTitle}>{r.title}</Text>
                    <Text style={styles.expMeta}>
                      <Feather name="repeat" size={10} color={palette.inkSoft} />  {r.cadence}
                    </Text>
                  </View>
                  <Money cents={r.amount} size={15} />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Trips inside this group */}
      {trips.length > 0 && (
        <>
          <SectionHeader title="Trips" action="New trip" />
          {trips.map(t => (
            <Card key={t.id} onPress={() => navigation.navigate('Trip', { tripId: t.id })}>
              <View style={styles.rowBetween}>
                <Text style={styles.expTitle}>{t.emoji}  {t.name}</Text>
                <Feather name="chevron-right" size={18} color={palette.inkFaint} />
              </View>
              <Text style={styles.expMeta}>{t.dates} · {t.settled ? 'Settled' : 'Unsettled'}</Text>
            </Card>
          ))}
        </>
      )}

      {/* One-off expenses */}
      <SectionHeader title="Expenses" action="Add" onAction={() => navigation.navigate('AddExpense', { groupId: group.id })} />
      <Card style={{ paddingVertical: space(1) }}>
        {group.expenses.map((e, i) => {
          const payer = MEMBERS[e.payerId];
          return (
            <View key={e.id}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable style={styles.expenseRow}
                onPress={() => navigation.navigate('AddExpense', { expenseId: e.id, groupId: group.id })}>
                <View style={styles.iconTile}>
                  <Feather name={e.icon as any} size={16} color={palette.spruce} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expTitle}>{e.title}</Text>
                  <Text style={styles.expMeta}>
                    {payer.id === ME ? 'You' : payer.name} paid · {e.date}
                  </Text>
                </View>
                <Money cents={e.amount} size={15} />
              </Pressable>
            </View>
          );
        })}
      </Card>

      {/* Members */}
      <SectionHeader title="Members" action="Invite" />
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {group.memberIds.map(id => (
          <View key={id} style={styles.memberChip}>
            <Avatar m={MEMBERS[id]} size={26} />
            <Text style={styles.memberName}>{MEMBERS[id].name}</Text>
          </View>
        ))}
        <Pressable style={[styles.memberChip, styles.inviteChip]}>
          <Feather name="link" size={15} color={palette.spruce} />
          <Text style={[styles.memberName, { color: palette.spruce }]}>Invite link</Text>
        </Pressable>
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
  ledgerLabel: {
    fontFamily: type.bodySemi, fontSize: 12, color: palette.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: space(2),
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  divider: { height: 1, backgroundColor: palette.line, marginLeft: 48 },
  iconTile: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.spruceTint,
    alignItems: 'center', justifyContent: 'center',
  },
  expTitle: { fontFamily: type.bodyMed, fontSize: 14.5, color: palette.ink },
  expMeta: { fontFamily: type.body, fontSize: 12, color: palette.inkSoft, marginTop: 2 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.mist, borderRadius: radius.pill,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
  },
  inviteChip: {
    backgroundColor: palette.spruceTint, paddingLeft: 14,
  },
  memberName: { fontFamily: type.bodyMed, fontSize: 13, color: palette.ink },
});
