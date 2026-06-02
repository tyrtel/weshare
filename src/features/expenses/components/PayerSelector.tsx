import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { Text } from '../../../components/ui/Text';
import { personColors, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { TripMember } from '../../../core/models/TripMember';

interface PayerSelectorProps {
  members: TripMember[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function PayerSelector({ members, selectedUserId, onSelect }: PayerSelectorProps) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xs }}
    >
      {members.map((member, i) => {
        const palette = personColors[i % personColors.length];
        const selected = member.userId === selectedUserId;

        return (
          <Pressable
            key={member.userId}
            onPress={() => onSelect(member.userId)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={member.displayName}
            style={{
              alignItems: 'center',
              gap: tokens.spacing.xs,
              opacity: selected ? 1 : 0.5,
            }}
          >
            <View
              style={{
                borderWidth: selected ? 2 : 0,
                borderColor: colors.primary.default,
                borderRadius: tokens.radius.badge + 3,
                padding: selected ? 2 : 0,
              }}
            >
              <Avatar
                initials={getInitials(member.displayName)}
                bg={palette.bg}
                color={palette.text}
                size="md"
              />
            </View>
            <Text
              variant="caption"
              color={selected ? colors.primary.default : colors.text.secondary}
              numberOfLines={1}
              style={{ maxWidth: 52 }}
            >
              {member.displayName.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
