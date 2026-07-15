import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { useColors, personColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { getInitials } from '../../core/utils/getInitials';

interface CurrentMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

interface CurrentMembersListProps {
  members: CurrentMember[];
  countLabel: string;
}

export function CurrentMembersList({ members, countLabel }: CurrentMembersListProps) {
  const colors = useColors();
  if (members.length === 0) return null;

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
        {countLabel}
      </Text>
      {members.map((member, i) => {
        const palette = personColors[i % personColors.length];
        return (
          <View key={member.userId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm }}>
            <Avatar initials={getInitials(member.displayName)} bg={palette.bg} url={member.avatarUrl} size="sm" />
            <Text variant="body" style={{ marginLeft: tokens.spacing.sm }}>{member.displayName}</Text>
          </View>
        );
      })}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: tokens.spacing.xs }} />
    </View>
  );
}
