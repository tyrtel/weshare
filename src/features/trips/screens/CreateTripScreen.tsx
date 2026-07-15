import React, { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Avatar } from '../../../components/ui';
import { CurrencyPicker } from '../../../components/ui/CurrencyPicker';
import { HeaderConfirmButton } from '../../../components/ui/HeaderConfirmButton';
import { LabeledTextInput } from '../../../components/ui/LabeledTextInput';
import { Text } from '../../../components/ui/Text';
import { useCreateTrip } from '../hooks/useCreateTrip';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { useColors, personColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { GroupMember } from '../../../core/models/GroupMember';

type Step = 'form' | 'members';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function MemberPickerRow({
  member,
  selected,
  onToggle,
  colorIndex,
}: {
  member: GroupMember;
  selected: boolean;
  onToggle: () => void;
  colorIndex: number;
}) {
  const colors  = useColors();
  const palette = personColors[colorIndex % personColors.length];

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={member.displayName}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: tokens.spacing.md,
        opacity: pressed ? 0.6 : selected ? 1 : 0.38,
      })}
    >
      <View
        style={{
          borderWidth: selected ? 2 : 0,
          borderColor: colors.primary.default,
          borderRadius: 999,
          padding: selected ? 2 : 0,
          marginRight: tokens.spacing.md,
        }}
      >
        <Avatar
          initials={getInitials(member.displayName)}
          bg={palette.bg}
          url={member.avatarUrl}
          size="md"
        />
      </View>
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {member.displayName}
      </Text>
      {selected && (
        <Ionicons name="checkmark-circle" size={22} color={colors.primary.default} />
      )}
    </Pressable>
  );
}

export function CreateTripScreen() {
  const { t }                          = useTranslation();
  const router                         = useRouter();
  const colors                         = useColors();
  const { createTrip, loading, error } = useCreateTrip();
  const { groupId }                    = useLocalSearchParams<{ groupId?: string }>();

  const group = useTripSessionStore(s => groupId ? s.groups.find(g => g.id === groupId) : undefined);

  const [step,     setStep]     = useState<Step>('form');
  const [name,     setName]     = useState('');
  const [currency, setCurrency] = useState(group?.currency ?? 'EUR');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(group?.members.map(m => m.userId) ?? []),
  );

  const toggleMember = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleFormNext = () => {
    if (!name.trim()) return;
    if (groupId && group) {
      setStep('members');
    } else {
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const selectedGroupMembers: GroupMember[] | undefined = group
      ? group.members.filter(m => selectedIds.has(m.userId))
      : undefined;

    const trip = await createTrip(name, currency, { groupId, selectedGroupMembers });
    if (trip) {
      if (groupId) {
        router.replace(`/trip/${trip.id}` as Parameters<typeof router.replace>[0]);
      } else {
        router.replace(`/add-participant?tripId=${trip.id}` as Parameters<typeof router.replace>[0]);
      }
    }
  };

  const isFormValid   = !loading && !!name.trim();
  const isMembersStep = step === 'members';

  const confirmButton = () => (
    <HeaderConfirmButton
      onPress={isMembersStep ? handleSubmit : handleFormNext}
      disabled={!isFormValid}
      loading={loading}
      accessibilityLabel={isMembersStep ? t('common.done') : t('trips.create.confirm_label')}
    />
  );

  if (isMembersStep && group) {
    return (
      <ScreenWrapper>
        <Stack.Screen
          options={{
            title: t('trips.create.member_picker_title'),
            headerLeft: () => (
              <Pressable
                onPress={() => setStep('form')}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: tokens.spacing.xs })}
              >
                <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
              </Pressable>
            ),
            headerRight: confirmButton,
          }}
        />
        <View style={{ flex: 1, padding: tokens.spacing.md }}>
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.xs }}>
            {t('trips.create.member_picker_heading')}
          </Text>
          <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
            {t('trips.create.member_picker_subtitle')}
          </Text>
          <FlatList
            data={group.members}
            keyExtractor={m => m.userId}
            renderItem={({ item, index }) => (
              <MemberPickerRow
                member={item}
                selected={selectedIds.has(item.userId)}
                onToggle={() => toggleMember(item.userId)}
                colorIndex={index}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.borderMuted }} />}
            showsVerticalScrollIndicator={false}
          />
          <ErrorBanner error={error} fallback={t('trips.create.error_fallback')} style={{ marginTop: tokens.spacing.md }} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('trips.create.title'), headerRight: confirmButton }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            {t('trips.create.heading')}
          </Text>

          <LabeledTextInput
            label={t('trips.form.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('trips.form.name_placeholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleFormNext}
            accessibilityLabel={t('trips.form.name_accessibility')}
          />

          <CurrencyPicker
            currency={currency}
            onSelect={setCurrency}
            fieldLabel={t('trips.form.currency_label')}
            selectLabel={t('trips.form.currency_select_label')}
            selectHeading={t('trips.form.currency_select_heading')}
            closeLabel={t('trips.form.currency_close_label')}
          />

          <ErrorBanner error={error} fallback={t('trips.create.error_fallback')} style={{ marginBottom: tokens.spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
