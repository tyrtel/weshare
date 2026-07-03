import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { palette, type, radius, space } from '../theme';
import { GROUPS, TRIPS, MEMBERS, ME, myNet } from '../data/mock';
import { Screen, Card, SectionHeader, AvatarStack, Money, BalancePill } from '../components/ui';
import { LedgerBars } from '../components/LedgerBars';

export default function HomeScreen({ navigation }: any) {
  const net = myNet();
  const activeTrips = TRIPS.filter(t => !t.settled);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {/* Header: overall position. The one big number on this screen. */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Overall, you're</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Money cents={net} sign size={34}
                color={net >= 0 ? palette.owed : palette.owes} />
              <Text style={styles.helloSub}>{net >= 0 ? 'ahead' : 'behind'}</Text>
            </View>
          </View>
          <Pressable style={styles.profileBtn}>
            <Feather name="user" size={19} color={palette.ink} />
          </Pressable>
        </View>

        {/* Active trips */}
        <SectionHeader title="Active trips" action="New trip" onAction={() => {}} />
        {activeTrips.map(trip => {
          const spent = trip.expenses.reduce((s, e) => s + e.amount, 0);
          return (
            <Card key={trip.id} onPress={() => navigation.navigate('Trip', { tripId: trip.id })}
              style={{ marginBottom: space(3) }}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 26 }}>{trip.emoji}</Text>
                  <View>
                    <Text style={styles.cardTitle}>{trip.name}</Text>
                    <Text style={styles.cardMeta}>{trip.dates} · {trip.expenses.length} expenses</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Money cents={spent} size={16} />
                  <AvatarStack members={trip.participantIds.map(id => MEMBERS[id])} size={22} />
                </View>
              </View>
              <View style={styles.unsettledTag}>
                <View style={styles.dot} />
                <Text style={styles.unsettledText}>Unsettled</Text>
              </View>
            </Card>
          );
        })}

        {/* Groups */}
        <SectionHeader title="Groups" action="New group" onAction={() => {}} />
        {GROUPS.map(g => (
          <Card key={g.id} onPress={() => navigation.navigate('Group', { groupId: g.id })}
            style={{ marginBottom: space(3) }}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                <View style={styles.emojiTile}><Text style={{ fontSize: 20 }}>{g.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{g.name}</Text>
                  {/* latest-activity indicator */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={styles.activityDot} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {g.lastActivity} · {g.lastActivityAt}
                    </Text>
                  </View>
                </View>
              </View>
              <BalancePill cents={g.balances[ME] ?? 0} />
            </View>
            {/* compact ledger preview */}
            <View style={{ marginTop: space(3) }}>
              <LedgerBars balances={g.balances} members={MEMBERS} compact />
            </View>
          </Card>
        ))}
      </Screen>

      {/* Global add */}
      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddExpense')}>
        <Feather name="plus" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hello: { fontFamily: type.body, fontSize: 14, color: palette.inkSoft, marginBottom: 2 },
  helloSub: { fontFamily: type.display, fontSize: 18, color: palette.ink },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: palette.paper,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: type.bodySemi, fontSize: 15.5, color: palette.ink },
  cardMeta: { fontFamily: type.body, fontSize: 12.5, color: palette.inkSoft, marginTop: 1 },
  emojiTile: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: palette.mist,
    alignItems: 'center', justifyContent: 'center',
  },
  activityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.butter },
  unsettledTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space(3),
    alignSelf: 'flex-start', backgroundColor: palette.owesTint,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.owes },
  unsettledText: { fontFamily: type.bodyMed, fontSize: 12, color: palette.owes },
  fab: {
    position: 'absolute', right: space(5), bottom: space(8),
    width: 58, height: 58, borderRadius: 29, backgroundColor: palette.spruce,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: palette.spruceDeep, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
});
