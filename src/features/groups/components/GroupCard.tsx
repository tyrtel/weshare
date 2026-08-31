import React from 'react';
import { View, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui';
import { useColors } from '../../../theme/colors';
import { personColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Group } from '../../../core/models/Group';
import type { GroupFinancialSummary } from '../hooks/useGroups';

interface GroupCardProps {
  group: Group;
  index: number;
  tripCount: number;
  summary?: GroupFinancialSummary;
  onPress: (group: Group) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function GroupCard({ group, index, tripCount, summary, onPress }: GroupCardProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;

  const maxVisible = 5;
  const visible    = group.members.slice(0, maxVisible);
  const overflow   = group.members.length - visible.length;

  const subtitleParts: string[] = [];
  if (group.members.length > 0) subtitleParts.push(t('groups.card.member_count', { count: group.members.length }));
  if (tripCount > 0) subtitleParts.push(t('groups.card.trip_count', { count: tripCount }));
  const subtitle = subtitleParts.join(' · ');

  const balanceColor = summary?.direction === 'owe'
    ? colors.error.default
    : summary?.direction === 'owed' || summary?.direction === 'settled'
    ? colors.success.default
    : colors.text.tertiary;

  const balanceLabel = summary?.direction === 'owe'
    ? t('groups.card.you_owe', { amount: formatCurrency(summary.amountCents, summary.currency) })
    : summary?.direction === 'owed'
    ? t('groups.card.you_are_owed', { amount: formatCurrency(summary.amountCents, summary.currency) })
    : summary?.direction === 'settled'
    ? t('groups.card.all_settled')
    : summary?.direction === 'partial'
    ? t('groups.card.you_settled')
    : null;

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <Card onPress={() => onPress(group)} style={{ marginBottom: tokens.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: tokens.spacing.sm }}>
            <Text variant="heading3" numberOfLines={1}>{group.name}</Text>
            {subtitle ? (
              <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: colors.primary.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" color={colors.primary.default} style={{ fontWeight: '700' }}>
              {group.currency}
            </Text>
          </View>
        </View>

        {visible.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.sm }}>
            {visible.map((member, i) => {
              const palette = personColors[i % personColors.length];
              return (
                <View
                  key={member.userId}
                  style={{ marginLeft: i === 0 ? 0 : tokens.pillStack.overlapOffset, zIndex: visible.length - i }}
                >
                  <Avatar initials={getInitials(member.displayName)} bg={palette.bg} url={member.avatarUrl} size="sm" />
                </View>
              );
            })}
            {overflow > 0 && (
              <View style={{ marginLeft: tokens.pillStack.overlapOffset }}>
                <Avatar initials={`+${overflow}`} bg="#3a3a5a" size="sm" />
              </View>
            )}
            {balanceLabel && (
              <Text
                variant="caption"
                color={balanceColor}
                style={{ marginLeft: tokens.spacing.sm, flex: 1, textAlign: 'right' }}
                numberOfLines={1}
              >
                {balanceLabel}
              </Text>
            )}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}
