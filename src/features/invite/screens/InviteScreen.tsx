import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { useService } from '../../../core/di/ServiceContext';
import { SHARE } from '../../../core/di/tokens';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

export function InviteScreen() {
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const colors     = useColors();
  const share      = useService(SHARE);

  const { trip, loading } = useTripDetail(tripId);

  if (loading || !trip) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const inviteUrl = trip.inviteToken
    ? Linking.createURL(`/join/${trip.inviteToken}`)
    : null;

  const handleShare = () => {
    share.shareTrip(trip.id, trip.name, trip.inviteToken ?? '');
  };

  return (
    <ScreenWrapper>
      <View style={{ flex: 1, padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT }}>

        <Text variant="heading2" style={{ marginBottom: tokens.spacing.xs }}>
          {t('invite.screen.title', { trip_name: trip.name })}
        </Text>
        <Text
          variant="body"
          color={colors.text.secondary}
          style={{ marginBottom: tokens.spacing.xl }}
        >
          {t('invite.screen.subtitle')}
        </Text>

        {inviteUrl ? (
          <>
            {/* Link pill */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('invite.screen.copy_label')}
              style={{
                backgroundColor: colors.surface,
                borderRadius: tokens.radius.pill,
                borderWidth: 1,
                borderColor: colors.primary.dim,
                paddingHorizontal: tokens.spacing.md,
                paddingVertical: tokens.spacing.sm,
                marginBottom: tokens.spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                variant="caption"
                color={colors.primary.light}
                style={{ flex: 1 }}
                numberOfLines={1}
              >
                {inviteUrl}
              </Text>
              <Text variant="caption" color={colors.text.tertiary} style={{ marginLeft: tokens.spacing.sm }}>
                {t('invite.screen.copy_button')}
              </Text>
            </Pressable>

            <Button label={t('invite.screen.share_button')} onPress={handleShare} />
          </>
        ) : (
          <View
            style={{
              padding: tokens.spacing.md,
              backgroundColor: colors.warning.bg,
              borderRadius: tokens.radius.md,
            }}
          >
            <Text variant="body" color={colors.warning.default}>
              {t('invite.screen.no_link_warning')}
            </Text>
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}
