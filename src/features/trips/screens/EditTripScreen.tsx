import React, { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { CurrencyPicker } from '../../../components/ui/CurrencyPicker';
import { LabeledTextInput } from '../../../components/ui/LabeledTextInput';
import { useEditTrip } from '../hooks/useEditTrip';
import { useTripDetail } from '../hooks/useTripDetail';
import { tokens } from '../../../theme/tokens';

export function EditTripScreen() {
  const { t } = useTranslation();
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const { trip, loading: tripLoading } = useTripDetail(id);
  const { editTrip, loading: saving, error } = useEditTrip();

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

  if (tripLoading || !trip) return <ScreenWrapper />;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('trips.edit.title') }} />
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
            disabled={saving || !name.trim()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      </ClosedTripGuard>
    </ScreenWrapper>
  );
}
