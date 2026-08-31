import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface BadgeProps {
  label: string;
  bg?: string;
  color?: string;
}

export function Badge({ label, bg, color }: BadgeProps) {
  const colors = useColors();

  return (
    <View
      style={{
        backgroundColor: bg ?? colors.primary.subtle,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: tokens.spacing.sm,
        paddingVertical: 2,
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* caption's lineHeight (16) is taller than its fontSize (11) for
          readability in body text, but that extra leading — combined with
          Android's default font padding — makes the glyph sit visibly off-
          center in a pill this tight. Collapse both back down here. */}
      <Text
        variant="caption"
        color={color ?? colors.primary.light}
        style={{ lineHeight: 14, includeFontPadding: false }}
      >
        {label}
      </Text>
    </View>
  );
}
