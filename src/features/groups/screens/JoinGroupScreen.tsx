import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { useJoinGroup } from '../hooks/useJoinGroup';
import { useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

export function JoinGroupScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router     = useRouter();
  const colors     = useColors();
  const auth       = useService(AUTH);

  const { group, loading, error, joining, joinError, joinAuthenticated } =
    useJoinGroup(token ?? '');

  const currentUser     = auth.currentUser();
  const isAuthenticated = currentUser !== null;

  const handleJoin = async () => {
    const joined = await joinAuthenticated();
    if (joined) {
      router.replace(`/group/${joined.id}`);
    }
  };

  // ── Loading (token resolution) ────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  // ── Invalid / expired token ───────────────────────────────────────────────
  if (error || !group) {
    return (
      <ScreenWrapper>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: tokens.spacing.xl,
          }}
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.sm, textAlign: 'center' }}>
            {t('groups.join.error_title')}
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ textAlign: 'center', marginBottom: tokens.spacing.lg }}
          >
            {t('groups.join.error_body')}
          </Text>
          <Button label={t('groups.join.go_home_button')} onPress={() => router.replace('/')} variant="ghost" />
        </View>
      </ScreenWrapper>
    );
  }

  // ── Sign-in prompt for unauthenticated users ─────────────────────────────
  if (!isAuthenticated) {
    return (
      <ScreenWrapper>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: tokens.spacing.xl,
          }}
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.sm, textAlign: 'center' }}>
            {t('groups.join.sign_in_title')}
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ textAlign: 'center', marginBottom: tokens.spacing.lg }}
          >
            {t('groups.join.sign_in_body', { group_name: group.name })}
          </Text>
          <Button
            label={t('groups.join.sign_in_button')}
            onPress={() => router.replace('/auth')}
          />
        </View>
      </ScreenWrapper>
    );
  }

  // ── Join form ─────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={{ flex: 1, padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT, justifyContent: 'center' }}>

        <Text
          variant="caption"
          color={colors.text.secondary}
          style={{ marginBottom: tokens.spacing.xs, textAlign: 'center' }}
        >
          {t('groups.join.invited_to_label')}
        </Text>
        <Text
          variant="heading1"
          style={{ marginBottom: tokens.spacing.xl, textAlign: 'center' }}
          numberOfLines={2}
        >
          {group.name}
        </Text>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.md,
            padding: tokens.spacing.md,
            marginBottom: tokens.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text variant="body" color={colors.text.secondary}>{t('groups.join.joining_as')} </Text>
          <Text variant="body">{currentUser.name}</Text>
        </View>

        <ErrorBanner error={joinError} fallback={t('groups.join.error_fallback')} style={{ marginBottom: tokens.spacing.md }} />

        <Button
          label={joining ? t('groups.join.joining_in_progress') : t('groups.join.join_button', { group_name: group.name })}
          onPress={handleJoin}
          disabled={joining}
        />
      </View>
    </ScreenWrapper>
  );
}
