import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { useJoinTrip } from '../hooks/useJoinTrip';
import { useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

export function JoinScreen() {
  const { token }  = useLocalSearchParams<{ token: string }>();
  const router     = useRouter();
  const colors     = useColors();
  const auth       = useService(AUTH);

  const { trip, loading, error, joining, joinError, joinAuthenticated } =
    useJoinTrip(token ?? '');

  const currentUser     = auth.currentUser();
  const isAuthenticated = currentUser !== null;

  const handleJoin = async () => {
    const joined = await joinAuthenticated();
    if (joined) {
      router.replace(`/trip/${joined.id}`);
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
  if (error || !trip) {
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
            Invite not found
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ textAlign: 'center', marginBottom: tokens.spacing.lg }}
          >
            This invite link may have expired or is no longer valid.
          </Text>
          <Button label="Go home" onPress={() => router.replace('/')} variant="ghost" />
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
            Sign in to join
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ textAlign: 'center', marginBottom: tokens.spacing.lg }}
          >
            You need to sign in before joining <Text variant="body">{trip.name}</Text>.
          </Text>
          <Button
            label="Sign in"
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
          You&apos;re invited to
        </Text>
        <Text
          variant="heading1"
          style={{ marginBottom: tokens.spacing.xl, textAlign: 'center' }}
          numberOfLines={2}
        >
          {trip.name}
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
          <Text variant="body" color={colors.text.secondary}>Joining as </Text>
          <Text variant="body">{currentUser.name}</Text>
        </View>

        <ErrorBanner error={joinError} fallback="Could not join trip. Please try again." style={{ marginBottom: tokens.spacing.md }} />

        <Button
          label={joining ? 'Joining…' : `Join ${trip.name}`}
          onPress={handleJoin}
          disabled={joining}
        />
      </View>
    </ScreenWrapper>
  );
}
