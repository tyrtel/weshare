import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { palette, type, radius, space, moneyStyle, fmtMoney } from '../theme';
import { MEMBERS, ME, SplitMode, ReceiptItem } from '../data/mock';
import { Screen, Card, Avatar, Segmented, Money, PrimaryButton, Hairline } from '../components/ui';

const PARTICIPANTS = ['u-jay', 'u-lea', 'u-sof', 'u-tom'];

export default function AddExpenseScreen({ navigation }: any) {
  const [title, setTitle] = useState('Cervejaria Ramiro');
  const [amountStr, setAmountStr] = useState('142.80');
  const amount = Math.round((parseFloat(amountStr) || 0) * 100);

  const [payerId, setPayerId] = useState(ME);
  const [mode, setMode] = useState<SplitMode>('itemized');

  // even
  const [included, setIncluded] = useState<string[]>(PARTICIPANTS);
  // proportion
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(PARTICIPANTS.map(id => [id, 1])));
  // exact
  const [exact, setExact] = useState<Record<string, string>>(
    Object.fromEntries(PARTICIPANTS.map(id => [id, ''])));
  // itemized
  const [items, setItems] = useState<ReceiptItem[]>([
    { id: 'i1', label: 'Garlic prawns', amount: 2400, assignees: ['u-jay', 'u-lea'] },
    { id: 'i2', label: 'Percebes', amount: 3800, assignees: ['u-sof'] },
    { id: 'i3', label: 'Crab', amount: 4200, assignees: PARTICIPANTS },
    { id: 'i4', label: 'Vinho verde ×2', amount: 2680, assignees: ['u-lea', 'u-tom'] },
    { id: 'i5', label: 'Bread & couvert', amount: 1200, assignees: [] },
  ]);

  const exactTotal = Object.values(exact).reduce((s, v) => s + Math.round((parseFloat(v) || 0) * 100), 0);
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
  const unassigned = items.filter(i => i.assignees.length === 0);

  const toggleInclude = (id: string) =>
    setIncluded(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  const bumpWeight = (id: string, d: number) =>
    setWeights(w => ({ ...w, [id]: Math.max(0, (w[id] ?? 0) + d) }));

  const toggleAssignee = (itemId: string, memberId: string) =>
    setItems(cur => cur.map(it => it.id !== itemId ? it : {
      ...it,
      assignees: it.assignees.includes(memberId)
        ? it.assignees.filter(a => a !== memberId)
        : [...it.assignees, memberId],
    }));

  // Per-person totals for the itemized receipt footer.
  const receiptTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const it of items) {
      if (!it.assignees.length) continue;
      const share = it.amount / it.assignees.length;
      for (const a of it.assignees) out[a] = (out[a] ?? 0) + share;
    }
    return out;
  }, [items]);

  const canSave =
    amount > 0 && title.length > 0 &&
    (mode !== 'exact' || exactTotal === amount) &&
    (mode !== 'itemized' || unassigned.length === 0);

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="x" size={24} color={palette.ink} />
        </Pressable>
        <Text style={styles.screenTitle}>Expense</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Amount + title */}
      <Card>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>€</Text>
          <TextInput
            style={styles.amountInput}
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={palette.inkFaint}
          />
        </View>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="What was it for?"
          placeholderTextColor={palette.inkFaint}
        />
      </Card>

      {/* Payer */}
      <Text style={styles.fieldLabel}>Paid by</Text>
      <View style={styles.payerRow}>
        {PARTICIPANTS.map(id => {
          const active = payerId === id;
          return (
            <Pressable key={id} onPress={() => setPayerId(id)}
              style={[styles.payerChip, active && styles.payerChipActive]}>
              <Avatar m={MEMBERS[id]} size={22} />
              <Text style={[styles.payerName, active && { color: '#fff' }]}>
                {MEMBERS[id].name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Split mode */}
      <Text style={styles.fieldLabel}>Split</Text>
      <Segmented
        value={mode}
        onChange={k => setMode(k as SplitMode)}
        options={[
          { key: 'even', label: 'Evenly' },
          { key: 'proportion', label: 'Shares' },
          { key: 'exact', label: 'Exact' },
          { key: 'itemized', label: 'Items' },
        ]}
      />

      <View style={{ height: space(3) }} />

      {/* ─── Evenly ─── */}
      {mode === 'even' && (
        <Card style={{ paddingVertical: space(1) }}>
          {PARTICIPANTS.map((id, i) => {
            const on = included.includes(id);
            const share = on && included.length ? Math.round(amount / included.length) : 0;
            return (
              <View key={id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <Pressable style={styles.splitRow} onPress={() => toggleInclude(id)}>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <Avatar m={MEMBERS[id]} size={30} />
                  <Text style={styles.splitName}>{MEMBERS[id].name}</Text>
                  <Money cents={share} size={14} color={on ? palette.ink : palette.inkFaint} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      {/* ─── Shares (proportion) ─── */}
      {mode === 'proportion' && (
        <Card style={{ paddingVertical: space(1) }}>
          {PARTICIPANTS.map((id, i) => {
            const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
            const w = weights[id] ?? 0;
            const share = Math.round(amount * w / total);
            return (
              <View key={id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <View style={styles.splitRow}>
                  <Avatar m={MEMBERS[id]} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.splitName}>{MEMBERS[id].name}</Text>
                    <Text style={styles.shareMeta}>
                      {w} share{w === 1 ? '' : 's'} · {Math.round(100 * w / total)}%
                    </Text>
                  </View>
                  <Money cents={share} size={14} color={w ? palette.ink : palette.inkFaint} />
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => bumpWeight(id, -1)}>
                      <Feather name="minus" size={15} color={palette.ink} />
                    </Pressable>
                    <Text style={styles.stepVal}>{w}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => bumpWeight(id, +1)}>
                      <Feather name="plus" size={15} color={palette.ink} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* ─── Exact amounts ─── */}
      {mode === 'exact' && (
        <Card style={{ paddingVertical: space(1) }}>
          {PARTICIPANTS.map((id, i) => (
            <View key={id}>
              {i > 0 && <View style={styles.rowDivider} />}
              <View style={styles.splitRow}>
                <Avatar m={MEMBERS[id]} size={30} />
                <Text style={[styles.splitName, { flex: 1 }]}>{MEMBERS[id].name}</Text>
                <View style={styles.exactBox}>
                  <Text style={styles.exactCurrency}>€</Text>
                  <TextInput
                    style={styles.exactInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={palette.inkFaint}
                    value={exact[id]}
                    onChangeText={v => setExact(cur => ({ ...cur, [id]: v }))}
                  />
                </View>
              </View>
            </View>
          ))}
          <Hairline />
          <View style={styles.remainRow}>
            <Text style={styles.remainLabel}>
              {exactTotal === amount ? 'Fully assigned' : 'Left to assign'}
            </Text>
            <Money
              cents={amount - exactTotal} size={14}
              color={exactTotal === amount ? palette.owed : palette.owes}
            />
          </View>
        </Card>
      )}

      {/* ─── Itemized: the receipt ─── */}
      {mode === 'itemized' && (
        <View style={styles.receipt}>
          <View style={styles.receiptEdge} />
          <View style={styles.receiptBody}>
            <Text style={styles.receiptHead}>{title.toUpperCase() || 'RECEIPT'}</Text>
            <Text style={styles.receiptSub}>tap an item, then tap who had it</Text>
            <Hairline dashed />
            {items.map(it => (
              <View key={it.id} style={{ marginBottom: space(3) }}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>{it.label}</Text>
                  <View style={styles.dots} />
                  <Text style={[moneyStyle as TextStyle, styles.itemAmount]}>
                    {fmtMoney(it.amount)}
                  </Text>
                </View>
                <View style={styles.assigneeRow}>
                  {PARTICIPANTS.map(id => {
                    const on = it.assignees.includes(id);
                    return (
                      <Pressable key={id} onPress={() => toggleAssignee(it.id, id)}
                        style={[styles.assignee, on && { backgroundColor: MEMBERS[id].hue, borderColor: MEMBERS[id].hue }]}>
                        <Text style={[styles.assigneeInitial, on && { color: '#fff' }]}>
                          {MEMBERS[id].initials}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {it.assignees.length === 0 && (
                    <Text style={styles.unassigned}>unassigned</Text>
                  )}
                  {it.assignees.length > 1 && (
                    <Text style={styles.perAssignee}>
                      {fmtMoney(Math.round(it.amount / it.assignees.length))} each
                    </Text>
                  )}
                </View>
              </View>
            ))}
            <Pressable style={styles.addItem}>
              <Feather name="plus" size={14} color={palette.spruce} />
              <Text style={styles.addItemLabel}>Add item</Text>
            </Pressable>
            <Hairline dashed />
            {/* per-person footer */}
            {Object.entries(receiptTotals).map(([id, cents]) => (
              <View key={id} style={styles.footerRow}>
                <Text style={styles.footerName}>{MEMBERS[id].name}</Text>
                <Text style={[moneyStyle as TextStyle, styles.footerAmount]}>
                  {fmtMoney(Math.round(cents))}
                </Text>
              </View>
            ))}
            <View style={[styles.footerRow, { marginTop: 4 }]}>
              <Text style={[styles.footerName, { fontFamily: type.bodySemi }]}>Items total</Text>
              <Text style={[moneyStyle as TextStyle, styles.footerAmount, {
                color: itemsTotal === amount ? palette.owed : palette.owes,
              }]}>
                {fmtMoney(itemsTotal)} / {fmtMoney(amount)}
              </Text>
            </View>
          </View>
          <View style={[styles.receiptEdge, { transform: [{ rotate: '180deg' }] }]} />
        </View>
      )}

      <View style={{ height: space(5) }} />
      <PrimaryButton
        label={canSave ? 'Save expense' : mode === 'itemized' && unassigned.length
          ? `${unassigned.length} item${unassigned.length > 1 ? 's' : ''} unassigned`
          : 'Save expense'}
        icon="check"
        onPress={canSave ? () => navigation.goBack() : undefined}
      />
    </Screen>
  );
}

const ZIGZAG = 14;

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(4) },
  screenTitle: { fontFamily: type.display, fontSize: 19, color: palette.ink },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  currency: { fontFamily: type.displayMed, fontSize: 26, color: palette.inkSoft },
  amountInput: {
    fontFamily: type.display, fontSize: 44, color: palette.ink,
    fontVariant: ['tabular-nums'], minWidth: 140, textAlign: 'center',
  },
  titleInput: {
    fontFamily: type.body, fontSize: 15, color: palette.ink, textAlign: 'center',
    borderTopWidth: 1, borderColor: palette.line, paddingTop: space(3), marginTop: space(2),
  },

  fieldLabel: {
    fontFamily: type.bodySemi, fontSize: 12, color: palette.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: space(5), marginBottom: space(2),
  },
  payerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  payerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.lineStrong,
    borderRadius: radius.pill, paddingVertical: 6, paddingLeft: 6, paddingRight: 13,
  },
  payerChipActive: { backgroundColor: palette.spruce, borderColor: palette.spruce },
  payerName: { fontFamily: type.bodyMed, fontSize: 13.5, color: palette.ink },

  splitRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  rowDivider: { height: 1, backgroundColor: palette.line },
  splitName: { fontFamily: type.bodyMed, fontSize: 14.5, color: palette.ink, flex: 1 },
  check: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: palette.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: palette.spruce, borderColor: palette.spruce },
  shareMeta: { fontFamily: type.body, fontSize: 12, color: palette.inkSoft, marginTop: 1 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: palette.mist,
    borderRadius: radius.pill, marginLeft: space(2),
  },
  stepBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontFamily: type.bodySemi, fontSize: 14, color: palette.ink, width: 20, textAlign: 'center' },
  exactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: palette.mist, borderRadius: radius.sm, paddingHorizontal: 10, height: 38,
  },
  exactCurrency: { fontFamily: type.bodyMed, fontSize: 14, color: palette.inkSoft },
  exactInput: {
    fontFamily: type.bodyMed, fontSize: 15, color: palette.ink,
    fontVariant: ['tabular-nums'], minWidth: 62, textAlign: 'right',
  },
  remainRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: space(2) },
  remainLabel: { fontFamily: type.bodyMed, fontSize: 13, color: palette.inkSoft },

  // Receipt
  receipt: {},
  receiptEdge: {
    height: ZIGZAG / 2, backgroundColor: palette.paper,
    // Simple sawtooth illusion: on device, replace with an SVG zigzag if you
    // want crisper perforation. Kept dependency-free here.
    borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.6,
    marginHorizontal: 6,
  },
  receiptBody: {
    backgroundColor: palette.paper, padding: space(4),
    borderRadius: 4,
    shadowColor: '#182420', shadowOpacity: 0.08, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  receiptHead: {
    fontFamily: type.displayMed, fontSize: 14, color: palette.ink,
    textAlign: 'center', letterSpacing: 2,
  },
  receiptSub: { fontFamily: type.body, fontSize: 11.5, color: palette.inkFaint, textAlign: 'center', marginTop: 3 },
  itemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  itemLabel: { fontFamily: type.bodyMed, fontSize: 14, color: palette.ink, flexShrink: 1 },
  dots: { flex: 1, borderBottomWidth: 1, borderStyle: 'dotted', borderColor: palette.lineStrong },
  itemAmount: { fontSize: 14, color: palette.ink },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  assignee: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: palette.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist,
  },
  assigneeInitial: { fontFamily: type.bodySemi, fontSize: 12, color: palette.inkSoft },
  unassigned: { fontFamily: type.body, fontSize: 11.5, color: palette.owes, marginLeft: 4 },
  perAssignee: { fontFamily: type.body, fontSize: 11.5, color: palette.inkFaint, marginLeft: 'auto' },
  addItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addItemLabel: { fontFamily: type.bodySemi, fontSize: 13, color: palette.spruce },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  footerName: { fontFamily: type.bodyMed, fontSize: 13.5, color: palette.ink },
  footerAmount: { fontSize: 13.5, color: palette.ink },
});
