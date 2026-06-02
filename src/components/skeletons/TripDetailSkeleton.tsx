import React from 'react';
import { View } from 'react-native';
import { SkeletonBlock } from '../ui/SkeletonBlock';
import { tokens } from '../../theme/tokens';

function SkeletonExpenseRow() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: tokens.spacing.sm,
        gap: tokens.spacing.sm,
      }}
    >
      {/* Payer avatar */}
      <SkeletonBlock width={28} height={28} borderRadius={tokens.radius.badge} />
      {/* Description + paid-by lines */}
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBlock width="60%" height={14} />
        <SkeletonBlock width="35%" height={11} />
      </View>
      {/* Amount */}
      <SkeletonBlock width={52} height={14} />
    </View>
  );
}

export function TripDetailSkeleton() {
  return (
    <View>
      {/* Header block */}
      <View
        style={{
          paddingHorizontal: tokens.spacing.md,
          paddingTop: tokens.spacing.md,
          paddingBottom: tokens.spacing.sm,
        }}
      >
        {/* Trip name + currency badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
          <SkeletonBlock width="50%" height={28} style={{ flex: 1, marginRight: tokens.spacing.sm }} />
          <SkeletonBlock width={36} height={20} borderRadius={tokens.radius.pill} />
        </View>
        {/* Avatar row + action buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: tokens.spacing.xs }}>
          <View style={{ flexDirection: 'row' }}>
            {[0, 1, 2].map((i) => (
              <SkeletonBlock
                key={i}
                width={28}
                height={28}
                borderRadius={tokens.radius.badge}
                style={{ marginLeft: i === 0 ? 0 : -8 }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.xs }}>
            <SkeletonBlock width={72} height={26} borderRadius={tokens.radius.pill} />
            <SkeletonBlock width={64} height={26} borderRadius={tokens.radius.pill} />
          </View>
        </View>
      </View>

      {/* Expense rows */}
      <View style={{ paddingHorizontal: tokens.spacing.md }}>
        <SkeletonExpenseRow />
        <SkeletonExpenseRow />
        <SkeletonExpenseRow />
      </View>
    </View>
  );
}
