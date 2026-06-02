import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Text } from '../../../components/ui/Text';
import { personColorFor, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Settlement } from '../../../core/models/Settlement';
import type { TripMember } from '../../../core/models/TripMember';

function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0];
}

interface PayoutSectionProps {
  settlements: Settlement[];
  members: TripMember[];
  currency: string;
}

export function PayoutSection({ settlements, members, currency }: PayoutSectionProps) {
  const colors = useColors();

  function displayName(userId: string): string {
    return members.find(m => m.userId === userId)?.displayName ?? userId;
  }

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.sm }}
      >
        Settle Up
      </Text>

      {settlements.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.md,
            padding: tokens.spacing.md,
            alignItems: 'center',
          }}
        >
          <Text variant="body" color={colors.text.secondary}>All settled up!</Text>
        </View>
      ) : (
        settlements.map(s => {
          const fromName = displayName(s.fromUserId);
          const toName   = displayName(s.toUserId);
          const fromClr  = personColorFor(s.fromUserId, members);
          const toClr    = personColorFor(s.toUserId, members);
          const key = `${s.fromUserId}-${s.toUserId}`;

          return (
            <View
              key={key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: tokens.radius.md,
                padding: tokens.spacing.md,
                marginBottom: tokens.spacing.sm,
              }}
            >
              {/* Debtor */}
              <View style={{ alignItems: 'center', minWidth: 56 }}>
                <Avatar initials={fromName} bg={fromClr.bg} color={fromClr.text} size="md" />
                <Text
                  variant="caption"
                  color={colors.text.secondary}
                  style={{ marginTop: 4, textAlign: 'center' }}
                >
                  {firstName(fromName)}
                </Text>
              </View>

              {/* Centre: amount + arrow */}
              <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: tokens.spacing.sm }}>
                <Text variant="label" color={colors.text.primary} style={{ marginBottom: 4 }}>
                  {formatCurrency(s.amountCents, currency)}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.primary.default} />
              </View>

              {/* Creditor */}
              <View style={{ alignItems: 'center', minWidth: 56 }}>
                <Avatar initials={toName} bg={toClr.bg} color={toClr.text} size="md" />
                <Text
                  variant="caption"
                  color={colors.text.secondary}
                  style={{ marginTop: 4, textAlign: 'center' }}
                >
                  {firstName(toName)}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
