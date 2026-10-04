import React from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface Props {
  onPress: () => void;
}

/** Compact "View history" affordance shared by group/trip/expense detail
 * screens — each has its own bespoke layout, so this stays a self-contained
 * row rather than something baked into any one screen's header. */
export function ViewHistoryLink({ onPress }: Props) {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('history.view_history_link')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name="clock" size={18} color={colors.primary.default} />
      <Text variant="label" color={colors.primary.default} style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
        {t('history.view_history_link')}
      </Text>
      <Feather name="chevron-right" size={18} color={colors.text.tertiary} />
    </Pressable>
  );
}
