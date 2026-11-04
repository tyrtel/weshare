import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { InviteLinkSettings } from '../../../components/ui/InviteLinkSettings';
import { useService } from '../../../core/di/ServiceContext';
import { AUTH, SHARE } from '../../../core/di/tokens';
import { inviteLinkStatus } from '../../../core/logic/inviteLink';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useTripInviteLink } from '../hooks/useTripInviteLink';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

export function InviteScreen() {
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const colors     = useColors();
  const share      = useService(SHARE);
  const auth       = useService(AUTH);

  const { trip, loading } = useTripDetail(tripId);
  const inviteLink = useTripInviteLink(tripId);

  if (loading || !trip) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const closed   = trip.status === 'closed';
  const status   = inviteLinkStatus(trip.inviteCreatedAt, trip.inviteTtlHours, new Date(), closed);
  const linkOpen = status.kind === 'never' || status.kind === 'expires';
  const inviteUrl = trip.inviteToken && linkOpen
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
        ) : !trip.inviteToken ? (
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
        ) : null}

        {trip.inviteToken && (
          <View style={{ marginTop: tokens.spacing.lg }}>
            <InviteLinkSettings
              createdAt={trip.inviteCreatedAt}
              ttlHours={trip.inviteTtlHours}
              closed={closed}
              canManage={auth.currentUser()?.id === trip.ownerId}
              busy={inviteLink.busy}
              error={inviteLink.error}
              onChangeTtl={inviteLink.setTtl}
              onReset={inviteLink.reset}
            />
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}
