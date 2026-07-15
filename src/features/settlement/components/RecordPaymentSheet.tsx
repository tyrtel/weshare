import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '../../../components/ui/Text';
import { AmountInput } from '../../expenses/components/AmountInput';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface RecordPaymentSheetProps {
  visible: boolean;
  fromLabel: string;
  toLabel: string;
  defaultAmountCents: number;
  currency: string;
  busy?: boolean;
  onConfirm: (amountCents: number) => void;
  onClose: () => void;
}

export function RecordPaymentSheet({
  visible,
  fromLabel,
  toLabel,
  defaultAmountCents,
  currency,
  busy = false,
  onConfirm,
  onClose,
}: RecordPaymentSheetProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [amountCents, setAmountCents] = useState(defaultAmountCents);
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset the entered amount each time the sheet opens (a prop-driven state
  // reset, per React's "adjusting state on prop change" pattern — not a
  // useEffect, since the sheet can stay mounted across visible transitions).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setAmountCents(defaultAmountCents);
  }

  const isAmountValid = amountCents > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel={t('settlement.record_payment.close_label')}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
          }}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <View style={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl }}>
            <Text variant="heading3" style={{ marginBottom: tokens.spacing.xs }}>
              {t('settlement.record_payment.title')}
            </Text>
            <Text variant="body" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
              {t('settlement.record_payment.subtitle', { from: fromLabel, to: toLabel })}
            </Text>

            <AmountInput
              amountCents={amountCents}
              onChangeCents={setAmountCents}
              currency={currency}
              label={t('settlement.record_payment.amount_label')}
            />

            {!isAmountValid && (
              <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
                {t('settlement.record_payment.invalid_amount')}
              </Text>
            )}

            <Pressable
              onPress={() => { if (isAmountValid && !busy) onConfirm(amountCents); }}
              disabled={!isAmountValid || busy}
              accessibilityRole="button"
              accessibilityLabel={t('settlement.record_payment.confirm_label')}
              style={({ pressed }) => ({
                marginTop: tokens.spacing.lg,
                backgroundColor: colors.primary.default,
                borderRadius: tokens.radius.pill,
                paddingVertical: tokens.spacing.sm,
                alignItems: 'center',
                opacity: !isAmountValid || busy || pressed ? 0.6 : 1,
              })}
            >
              {busy
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text variant="label" color="#ffffff">{t('settlement.record_payment.confirm_button')}</Text>
              }
            </Pressable>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('settlement.record_payment.cancel')}
              style={({ pressed }) => ({
                marginTop: tokens.spacing.md,
                alignItems: 'center',
                paddingVertical: tokens.spacing.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label" color={colors.text.secondary}>{t('settlement.record_payment.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
