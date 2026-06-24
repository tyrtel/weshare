import React, { useState } from 'react';
import { View, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Text } from '../../../components/ui/Text';
import { useCreateTrip } from '../hooks/useCreateTrip';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { CURRENCIES, currencyLabel } from '../../../core/constants/currencies';

export function CreateTripScreen() {
  const router = useRouter();
  const colors = useColors();
  const { createTrip, loading, error } = useCreateTrip();

  const [name,            setName]            = useState('');
  const [currency,        setCurrency]        = useState('EUR');
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const handleSubmit = async () => {
    const trip = await createTrip(name, currency);
    if (trip) {
      router.replace(`/add-participant?tripId=${trip.id}`);
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

  const isValid = !loading && !!name.trim();

  const confirmButton = () => (
    <Pressable
      onPress={handleSubmit}
      disabled={!isValid}
      accessibilityRole="button"
      accessibilityLabel="Confirm new trip"
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: isValid ? colors.primary.default : colors.text.tertiary,
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

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'New Trip', headerRight: confirmButton }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            New Trip
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

          <ErrorBanner error={error} fallback="Could not create trip. Try again." style={{ marginBottom: tokens.spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Inline overlay — avoids Modal-inside-modal crash on Android (screen is
          already presented as a modal by expo-router presentation: 'modal'). */}
      {dropdownVisible && (
        <Pressable
          style={[styles.backdrop, { padding: tokens.spacing.xl }]}
          onPress={() => setDropdownVisible(false)}
          accessibilityLabel="Close currency picker"
          accessibilityRole="button"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
            <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text variant="label" color={colors.text.secondary}>Select currency</Text>
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
