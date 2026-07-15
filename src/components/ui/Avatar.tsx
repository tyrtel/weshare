import React, { useState, useEffect } from 'react';
import { View, Image } from 'react-native';
import { Text } from './Text';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const dimensionMap: Record<AvatarSize, number> = { xs: 22, sm: 28, md: 36, lg: 44 };
const fontSizeMap:  Record<AvatarSize, number> = { xs: 11, sm: 14, md: 17, lg: 21 };

interface AvatarProps {
  initials: string;
  bg: string;
  size?: AvatarSize;
  url?: string;
}

export function Avatar({ initials, bg, size = 'md', url }: AvatarProps) {
  const dimension = dimensionMap[size];
  const [imgError, setImgError] = useState(false);

  // Reset error state when the URL changes so a new URL gets a fresh attempt.
  useEffect(() => { setImgError(false); }, [url]);

  const showImage = !!url && !imgError;

  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={{ width: dimension, height: dimension }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          style={{
            color: '#ffffff',
            fontSize: fontSizeMap[size],
            fontWeight: '600',
            lineHeight: fontSizeMap[size] + 2,
            includeFontPadding: false,
          }}
        >
          {initials.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
