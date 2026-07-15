import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { ledgerColors, personColorFor } from '../../theme/colors';

interface ParticipantMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

interface ParticipantsRowProps {
  members: ParticipantMember[];
  onInvitePress: () => void;
  inviteLabel: string;
}

// Stacked avatar-over-first-name row with a trailing dashed "invite" circle.
// Extracted from TripDetailScreen's Participants row — the design the user
// picked as the winner over GroupDetailScreen's side-by-side pill chips.
export function ParticipantsRow({ members, onInvitePress, inviteLabel }: ParticipantsRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      {members.map(m => {
        const pc = personColorFor(m.userId, members);
        return (
          <View key={m.userId} style={{ alignItems: 'center', gap: 4 }}>
            <Avatar initials={m.displayName} bg={pc.bg} url={m.avatarUrl} size="lg" />
            <Text style={{ fontSize: 12, fontWeight: '500', color: ledgerColors.text.primary }}>
              {m.displayName.split(' ')[0]}
            </Text>
          </View>
        );
      })}
      <Pressable onPress={onInvitePress} style={{ alignItems: 'center', gap: 4 }}>
        <View style={styles.inviteCircle}>
          <Feather name="user-plus" size={18} color={ledgerColors.primary.default} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: '500', color: ledgerColors.primary.default }}>
          {inviteLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inviteCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: ledgerColors.primary.default,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ledgerColors.primary.subtle,
  },
});
