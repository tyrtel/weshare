import React, { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { CurrencyPicker } from '../../../components/ui/CurrencyPicker';
import { HeaderConfirmButton } from '../../../components/ui/HeaderConfirmButton';
import { LabeledTextInput } from '../../../components/ui/LabeledTextInput';
import { useEditTrip } from '../hooks/useEditTrip';
import { useDeleteTrip } from '../hooks/useDeleteTrip';
import { useTripDetail } from '../hooks/useTripDetail';
import { useService } from '../../../core/di/ServiceContext';
import { confirm } from '../../../core/utils/confirm';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

export function EditTripScreen() {
  const { t } = useTranslation();
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const auth    = useService(AUTH);
  const colors  = useColors();

  const { trip, loading: tripLoading } = useTripDetail(id);
  const { editTrip, loading: saving, error } = useEditTrip();
  const { deleteTrip, loading: deleting, error: deleteError } = useDeleteTrip();

  const [name,        setName]        = useState('');
  const [currency,    setCurrency]    = useState('EUR');
  const [initialised, setInitialised] = useState(false);

  if (trip && !initialised) {
    setName(trip.name);
    setCurrency(trip.currency);
    setInitialised(true);
  }

  const handleSubmit = async () => {
    if (!trip) return;
    const updated = await editTrip(trip, name, currency);
    if (updated) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  };

  const handleDelete = () => {
    if (!trip) return;
    void confirm(t('trips.edit.delete_title'), t('trips.edit.delete_message'), t('trips.edit.delete_confirm')).then(async confirmed => {
      if (!confirmed) return;
      const ok = await deleteTrip(trip.id);
      if (ok) router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
    });
  };

  if (tripLoading || !trip) return <ScreenWrapper />;

  const isOwner = auth.currentUser()?.id === trip.ownerId;
  const isValid = !saving && !!name.trim();

  const confirmButton = () => (
    <HeaderConfirmButton
      onPress={handleSubmit}
      disabled={!isValid}
      loading={saving}
      accessibilityLabel={t('trips.edit.confirm_label')}
    />
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('trips.edit.title'), headerRight: confirmButton }} />
      <ClosedTripGuard trip={trip} message={t('trips.edit.closed_guard')}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            {t('trips.edit.heading')}
          </Text>

          <LabeledTextInput
            label={t('trips.form.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('trips.form.name_placeholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
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

          <ErrorBanner error={error} fallback={t('trips.edit.error_fallback')} style={{ marginBottom: tokens.spacing.md }} />

          <Button
            label={saving ? t('trips.edit.saving') : t('trips.edit.save_button')}
            onPress={handleSubmit}
            disabled={!isValid}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      </ClosedTripGuard>

      {isOwner && (
        <>
          <ErrorBanner error={deleteError} fallback={t('trips.edit.delete_error_fallback')} style={{ marginHorizontal: tokens.spacing.md }} />
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            accessibilityRole="button"
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: tokens.spacing.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="label" color={colors.error.default}>{t('trips.edit.delete_confirm')}</Text>
          </Pressable>
        </>
      )}
    </ScreenWrapper>
  );
}
