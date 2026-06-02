import React from 'react';
import { View } from 'react-native';
import { SkeletonBlock } from '../ui/SkeletonBlock';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

function SkeletonCard() {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.card,
        padding: tokens.spacing.md,
        marginBottom: tokens.spacing.sm,
      }}
    >
      {/* Name + currency badge row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
        <SkeletonBlock width="55%" height={18} />
        <SkeletonBlock width={36} height={20} borderRadius={tokens.radius.pill} />
      </View>
      {/* Date line */}
      <SkeletonBlock width="30%" height={12} style={{ marginBottom: tokens.spacing.sm }} />
      {/* Avatar stubs */}
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
    </View>
  );
}

export function TripListSkeleton() {
  return (
    <View style={{ paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.xs }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}
