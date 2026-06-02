import React from 'react';
import { View } from 'react-native';
import { SkeletonBlock } from '../ui/SkeletonBlock';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

function SkeletonSettlementRow() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: tokens.spacing.md,
      }}
    >
      {/* Debtor avatar */}
      <SkeletonBlock width={36} height={36} borderRadius={tokens.radius.badge} />
      {/* Amount + arrow block */}
      <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
        <SkeletonBlock width={64} height={14} />
        <SkeletonBlock width={32} height={10} />
      </View>
      {/* Creditor avatar */}
      <SkeletonBlock width={36} height={36} borderRadius={tokens.radius.badge} />
      {/* Action button stub */}
      <SkeletonBlock
        width={48}
        height={26}
        borderRadius={tokens.radius.pill}
        style={{ marginLeft: tokens.spacing.md }}
      />
    </View>
  );
}

export function SettlementSkeleton() {
  const colors = useColors();
  return (
    <View>
      {/* Summary card stub */}
      <View
        style={{
          margin: tokens.spacing.md,
          padding: tokens.spacing.md,
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.card,
        }}
      >
        <SkeletonBlock width="40%" height={12} style={{ marginBottom: tokens.spacing.xs }} />
        <SkeletonBlock width="55%" height={28} />
      </View>

      {/* Settlement rows */}
      <View style={{ paddingHorizontal: tokens.spacing.md }}>
        <SkeletonSettlementRow />
        <View style={{ height: 1, backgroundColor: colors.borderMuted }} />
        <SkeletonSettlementRow />
      </View>
    </View>
  );
}
