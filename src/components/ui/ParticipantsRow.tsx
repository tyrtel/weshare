import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { useColors, personColorFor } from '../../theme/colors';

interface ParticipantMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  isGuest?: boolean;
  email?: string;
}

interface ParticipantsRowProps {
  members: ParticipantMember[];
  onInvitePress: () => void;
  inviteLabel: string;
  /** When provided, unclaimed (isGuest) members render a small indicator and become tappable — owner-only, so pass this conditionally. */
  onMemberPress?: (member: ParticipantMember) => void;
  unlinkedLabel?: string;
}

// Stacked avatar-over-first-name row with a trailing dashed "invite" circle.
// Extracted from TripDetailScreen's Participants row — the design the user
// picked as the winner over GroupDetailScreen's side-by-side pill chips.
export function ParticipantsRow({ members, onInvitePress, inviteLabel, onMemberPress, unlinkedLabel }: ParticipantsRowProps) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      {members.map(m => {
        const pc = personColorFor(m.userId, members);
        const unlinked = Boolean(m.isGuest) && Boolean(onMemberPress);
        const avatar = (
          <View>
            <Avatar initials={m.displayName} bg={pc.bg} url={m.avatarUrl} size="lg" />
            {unlinked && <View style={[styles.unlinkedDot, { backgroundColor: colors.primary.default, borderColor: colors.surface }]} />}
          </View>
        );
        return (
          <View key={m.userId} style={{ alignItems: 'center', gap: 4 }}>
            {unlinked ? (
              <Pressable
                onPress={() => onMemberPress!(m)}
                accessibilityRole="button"
                accessibilityLabel={unlinkedLabel}
              >
                {avatar}
              </Pressable>
            ) : avatar}
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text.primary }}>
              {m.displayName.split(' ')[0]}
            </Text>
          </View>
        );
      })}
      <Pressable onPress={onInvitePress} style={{ alignItems: 'center', gap: 4 }}>
        <View style={[styles.inviteCircle, { borderColor: colors.primary.default, backgroundColor: colors.primary.subtle }]}>
          <Feather name="user-plus" size={18} color={colors.primary.default} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: '500', color: colors.primary.default }}>
          {inviteLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inviteCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  unlinkedDot: {
    position: 'absolute', top: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2,
  },
});
