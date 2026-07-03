import React from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ViewStyle, TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { palette, type, radius, space, shadow, moneyStyle, fmtMoney } from '../theme';
import { Member } from '../data/mock';

export const Screen = ({ children, scroll = true, style }: {
  children: React.ReactNode; scroll?: boolean; style?: ViewStyle;
}) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: palette.mist }} edges={['top']}>
    {scroll ? (
      <ScrollView
        contentContainerStyle={[{ padding: space(5), paddingBottom: space(12) }, style]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[{ flex: 1, padding: space(5) }, style]}>{children}</View>
    )}
  </SafeAreaView>
);

export const Card = ({ children, style, onPress }: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void;
}) => {
  const inner = (
    <View style={[styles.card, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {inner}
    </Pressable>
  );
};

export const SectionHeader = ({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) => (
  <View style={styles.sectionRow}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action ? (
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

export const Avatar = ({ m, size = 36, ring = false }: { m: Member; size?: number; ring?: boolean }) => (
  <View
    style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: m.hue, alignItems: 'center', justifyContent: 'center',
      borderWidth: ring ? 2 : 0, borderColor: palette.paper,
    }}
  >
    <Text style={{ color: '#fff', fontFamily: type.bodySemi, fontSize: size * 0.42 }}>
      {m.initials}
    </Text>
  </View>
);

export const AvatarStack = ({ members, size = 28 }: { members: Member[]; size?: number }) => (
  <View style={{ flexDirection: 'row' }}>
    {members.slice(0, 4).map((m, i) => (
      <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
        <Avatar m={m} size={size} ring />
      </View>
    ))}
    {members.length > 4 && (
      <View style={[styles.overflowBadge, { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.3 }]}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: 11, color: palette.inkSoft }}>
          +{members.length - 4}
        </Text>
      </View>
    )}
  </View>
);

export const Money = ({ cents, sign = false, size = 16, color, style: s }: {
  cents: number; sign?: boolean; size?: number; color?: string; style?: TextStyle;
}) => (
  <Text style={[moneyStyle as TextStyle, { fontSize: size, color: color ?? palette.ink }, s]}>
    {fmtMoney(cents, sign)}
  </Text>
);

export const BalancePill = ({ cents }: { cents: number }) => {
  const owed = cents >= 0;
  return (
    <View style={[styles.pill, { backgroundColor: owed ? palette.owedTint : palette.owesTint }]}>
      <Text style={[moneyStyle as TextStyle, { fontSize: 13, color: owed ? palette.owed : palette.owes }]}>
        {fmtMoney(cents, true)}
      </Text>
    </View>
  );
};

export const PrimaryButton = ({ label, icon, onPress, tone = 'spruce' }: {
  label: string; icon?: keyof typeof Feather.glyphMap; onPress?: () => void;
  tone?: 'spruce' | 'ghost';
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.btn,
      tone === 'spruce'
        ? { backgroundColor: pressed ? palette.spruceDeep : palette.spruce }
        : { backgroundColor: pressed ? palette.line : palette.paper, borderWidth: 1, borderColor: palette.lineStrong },
    ]}
  >
    {icon && <Feather name={icon} size={17} color={tone === 'spruce' ? '#fff' : palette.ink} />}
    <Text style={[styles.btnLabel, { color: tone === 'spruce' ? '#fff' : palette.ink }]}>{label}</Text>
  </Pressable>
);

export const Segmented = ({ options, value, onChange }: {
  options: { key: string; label: string }[]; value: string; onChange: (k: string) => void;
}) => (
  <View style={styles.segmented}>
    {options.map(o => {
      const active = o.key === value;
      return (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.segment, active && styles.segmentActive]}
        >
          <Text style={[styles.segmentLabel, active && { color: palette.ink }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const Hairline = ({ dashed = false }: { dashed?: boolean }) => (
  <View style={{
    borderBottomWidth: 1, borderColor: palette.line,
    borderStyle: dashed ? 'dashed' : 'solid', marginVertical: space(3),
  }} />
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.paper,
    borderRadius: radius.lg,
    padding: space(4),
    ...shadow.card,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: space(6), marginBottom: space(3),
  },
  sectionTitle: { fontFamily: type.display, fontSize: 18, color: palette.ink, letterSpacing: -0.3 },
  sectionAction: { fontFamily: type.bodySemi, fontSize: 13, color: palette.spruce },
  overflowBadge: {
    backgroundColor: palette.line, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: palette.paper,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  btn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: radius.md, flex: 1,
  },
  btnLabel: { fontFamily: type.bodySemi, fontSize: 15 },
  segmented: {
    flexDirection: 'row', backgroundColor: palette.line, borderRadius: radius.md, padding: 3,
  },
  segment: {
    flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.md - 3,
  },
  segmentActive: { backgroundColor: palette.paper, ...shadow.card },
  segmentLabel: { fontFamily: type.bodyMed, fontSize: 13, color: palette.inkSoft },
});
