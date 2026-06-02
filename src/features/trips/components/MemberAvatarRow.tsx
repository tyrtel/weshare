import React from 'react';
import { View } from 'react-native';
import { Avatar } from '../../../components/ui';
import { personColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { TripMember } from '../../../core/models/TripMember';

interface MemberAvatarRowProps {
  members: TripMember[];
  /** Maximum avatars to show before +N overflow badge. Default 5. */
  maxVisible?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function MemberAvatarRow({ members, maxVisible = 5 }: MemberAvatarRowProps) {
  const visible = members.slice(0, maxVisible);
  const overflow = members.length - visible.length;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {visible.map((member, i) => {
        const palette = personColors[i % personColors.length];
        return (
          <View
            key={member.userId}
            style={{
              marginLeft: i === 0 ? 0 : tokens.pillStack.overlapOffset,
              zIndex: visible.length - i,
            }}
          >
            <Avatar
              initials={getInitials(member.displayName)}
              bg={palette.bg}
              color={palette.text}
              size="sm"
            />
          </View>
        );
      })}

      {overflow > 0 && (
        <View
          style={{
            marginLeft: tokens.pillStack.overlapOffset,
            width: 28,
            height: 28,
            borderRadius: tokens.radius.badge,
            backgroundColor: '#2a2a4a',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View>
            {/* Rendered as Avatar with custom bg to keep consistent size */}
          </View>
          <Avatar initials={`+${overflow}`} bg="#2a2a4a" color="#8888aa" size="sm" />
        </View>
      )}
    </View>
  );
}
