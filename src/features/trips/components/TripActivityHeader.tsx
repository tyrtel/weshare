import React from 'react';
import { View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface TripActivityHeaderProps {
  count: number;
  showAll: boolean;
  onToggleShowAll: () => void;
}

export function TripActivityHeader({ count, showAll, onToggleShowAll }: TripActivityHeaderProps) {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: tokens.spacing.sm,
      }}
    >
      <Text variant="label" color={colors.text.secondary}>{t('trips.activity_header.title')}</Text>
      {count > 3 && (
        <Pressable
          onPress={onToggleShowAll}
          accessibilityRole="button"
          accessibilityLabel={showAll ? t('trips.activity_header.show_fewer_label') : t('trips.activity_header.show_all_label')}
          hitSlop={8}
        >
          <Text variant="caption" color={colors.primary.light}>
            {showAll ? t('trips.activity_header.show_less') : t('trips.activity_header.show_all', { count })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
