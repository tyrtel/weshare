import React, { useState } from 'react';
import { View, TextInput, ActivityIndicator } from 'react-native';
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

  const { trip, loading, error, joining, joinError, joinAsGuest, joinAuthenticated } =
    useJoinTrip(token ?? '');

  const currentUser      = auth.currentUser();
  const isAuthenticated  = currentUser !== null;
  const [guestName, setGuestName] = useState('');

  const handleJoin = async () => {
    let joined;
    if (isAuthenticated) {
      joined = await joinAuthenticated();
    } else {
      joined = await joinAsGuest(guestName);
    }
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

  // ── Join form ─────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={{ flex: 1, padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT, justifyContent: 'center' }}>

        {/* Trip info */}
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

        {/* Name input for guests */}
        {!isAuthenticated && (
          <View style={{ marginBottom: tokens.spacing.md }}>
            <Text
              variant="label"
              color={colors.text.secondary}
              style={{ marginBottom: tokens.spacing.xs }}
            >
              Your name
            </Text>
            <TextInput
              value={guestName}
              onChangeText={setGuestName}
              placeholder="e.g. Marie Curie"
              placeholderTextColor={colors.text.tertiary}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: tokens.radius.md,
                paddingHorizontal: tokens.spacing.md,
                paddingVertical: tokens.spacing.sm,
                color: colors.text.primary,
                fontSize: tokens.fontSize.md,
              }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              accessibilityLabel="Your name"
            />
          </View>
        )}

        {/* Signed-in user info */}
        {isAuthenticated && (
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
            <Text variant="body" color={colors.text.secondary}>
              Joining as{' '}
            </Text>
            <Text variant="body">{currentUser!.name}</Text>
          </View>
        )}

        {/* Join error */}
        <ErrorBanner error={joinError} fallback="Could not join trip. Please try again." style={{ marginBottom: tokens.spacing.md }} />

        <Button
          label={joining ? 'Joining…' : isAuthenticated ? `Join ${trip.name}` : 'Join as guest'}
          onPress={handleJoin}
          disabled={joining || (!isAuthenticated && !guestName.trim())}
        />
      </View>
    </ScreenWrapper>
  );
}
