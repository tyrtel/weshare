import React, { useState } from 'react';
import { View, TextInput, ScrollView, Pressable, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { useEditTrip } from '../hooks/useEditTrip';
import { useTripDetail } from '../hooks/useTripDetail';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

const CURRENCIES: { code: string; symbol: string }[] = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CHF', symbol: 'Fr' },
];

function currencyLabel(code: string): string {
  const entry = CURRENCIES.find(c => c.code === code);
  return entry ? `${entry.symbol} ${entry.code}` : code;
}

export function EditTripScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();

  const { trip, loading: tripLoading } = useTripDetail(id);
  const { editTrip, loading: saving, error } = useEditTrip();

  const [name,            setName]            = useState('');
  const [currency,        setCurrency]        = useState('EUR');
  const [initialised,     setInitialised]     = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);

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

  if (tripLoading || !trip) return <ScreenWrapper />;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Edit Trip' }} />
      <ClosedTripGuard trip={trip} message="This trip is closed and can no longer be edited.">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            Edit Trip
          </Text>

          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
            Trip name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chez Paul dinner"
            placeholderTextColor={colors.text.tertiary}
            style={inputStyle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Trip name"
          />

          <Text
            variant="label"
            color={colors.text.secondary}
            style={{ marginBottom: tokens.spacing.xs }}
          >
            Currency
          </Text>
          <Pressable
            onPress={() => setDropdownVisible(true)}
            accessibilityRole="combobox"
            accessibilityLabel="Select currency"
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

          <Modal
            visible={dropdownVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDropdownVisible(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: tokens.spacing.xl }}
              onPress={() => setDropdownVisible(false)}
            >
              <Pressable onPress={() => {}}>
                <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.card, overflow: 'hidden' }}>
                  <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text variant="label" color={colors.text.secondary}>Select currency</Text>
                  </View>
                  <FlatList
                    data={CURRENCIES}
                    keyExtractor={item => item.code}
                    renderItem={({ item }) => {
                      const selected = item.code === currency;
                      return (
                        <Pressable
                          onPress={() => { setCurrency(item.code); setDropdownVisible(false); }}
                          accessibilityRole="option"
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
                      );
                    }}
                    ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.borderMuted }} />}
                  />
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          <ErrorBanner error={error} fallback="Could not update trip." style={{ marginBottom: tokens.spacing.md }} />

          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            onPress={handleSubmit}
            disabled={saving || !name.trim()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      </ClosedTripGuard>
    </ScreenWrapper>
  );
}
