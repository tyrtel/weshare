import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { tokens } from '../../theme/tokens';
import type { TypographyVariant } from '../../theme/typography';

type AvatarSize = 'sm' | 'md' | 'lg';

const dimensionMap: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 44 };
const fontVariantMap: Record<AvatarSize, TypographyVariant> = {
  sm: 'caption',
  md: 'label',
  lg: 'body',
};

interface AvatarProps {
  initials: string;
  bg: string;
  color: string;
  size?: AvatarSize;
}

export function Avatar({ initials, bg, color, size = 'md' }: AvatarProps) {
  const dimension = dimensionMap[size];

  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: tokens.radius.badge,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={fontVariantMap[size]} color={color}>
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
