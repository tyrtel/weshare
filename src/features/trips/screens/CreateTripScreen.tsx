import React, { useState } from 'react';
import { View, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Avatar } from '../../../components/ui';
import { Text } from '../../../components/ui/Text';
import { useCreateTrip } from '../hooks/useCreateTrip';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { useColors, personColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { CURRENCIES, currencyLabel } from '../../../core/constants/currencies';
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
          bg={palette.text}
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

  const [step,            setStep]            = useState<Step>('form');
  const [name,            setName]            = useState('');
  const [currency,        setCurrency]        = useState(group?.currency ?? 'EUR');
  const [dropdownVisible, setDropdownVisible] = useState(false);

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

  const inputStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    color: colors.text.primary,
    fontSize: tokens.fontSize.md,
    marginBottom: tokens.spacing.md,
  };

  const isFormValid   = !loading && !!name.trim();
  const isMembersStep = step === 'members';

  const confirmButton = () => (
    <Pressable
      onPress={isMembersStep ? handleSubmit : handleFormNext}
      disabled={!isFormValid}
      accessibilityRole="button"
      accessibilityLabel={isMembersStep ? t('common.done') : t('trips.create.confirm_label')}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: isFormValid ? colors.primary.default : colors.text.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: tokens.spacing.xs,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Ionicons name="checkmark" size={20} color="#fff" />}
    </Pressable>
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

          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
            {t('trips.form.name_label')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('trips.form.name_placeholder')}
            placeholderTextColor={colors.text.tertiary}
            style={inputStyle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleFormNext}
            accessibilityLabel={t('trips.form.name_accessibility')}
          />

          <Text
            variant="label"
            color={colors.text.secondary}
            style={{ marginBottom: tokens.spacing.xs }}
          >
            {t('trips.form.currency_label')}
          </Text>
          <Pressable
            onPress={() => setDropdownVisible(true)}
            accessibilityRole="combobox"
            accessibilityLabel={t('trips.form.currency_select_label')}
            accessibilityState={{ expanded: dropdownVisible }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: tokens.radius.md,
              paddingHorizontal: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
              marginBottom: tokens.spacing.lg,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="body" color={colors.text.primary}>{currencyLabel(currency)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
          </Pressable>

          <ErrorBanner error={error} fallback={t('trips.create.error_fallback')} style={{ marginBottom: tokens.spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Inline overlay — avoids Modal-inside-modal crash on Android (screen is
          already presented as a modal by expo-router presentation: 'modal'). */}
      {dropdownVisible && (
        <Pressable
          style={[styles.backdrop, { padding: tokens.spacing.xl }]}
          onPress={() => setDropdownVisible(false)}
          accessibilityLabel={t('trips.form.currency_close_label')}
          accessibilityRole="button"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
            <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text variant="label" color={colors.text.secondary}>{t('trips.form.currency_select_heading')}</Text>
            </View>
            {CURRENCIES.map((item, index) => {
              const selected = item.code === currency;
              return (
                <View key={item.code}>
                  {index > 0 && <View style={{ height: 1, backgroundColor: colors.borderMuted }} />}
                  <Pressable
                    onPress={() => { setCurrency(item.code); setDropdownVisible(false); }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: tokens.spacing.md,
                      paddingVertical: tokens.spacing.md,
                      backgroundColor: pressed ? colors.surfaceAlt : selected ? colors.primary.subtle : 'transparent',
                    })}
                  >
                    <Text variant="body" color={selected ? colors.primary.default : colors.text.primary}>
                      {`${item.symbol} ${item.code}`}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={16} color={colors.primary.default} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    zIndex: 100,
  },
  sheet: {
    overflow: 'hidden',
  },
});
