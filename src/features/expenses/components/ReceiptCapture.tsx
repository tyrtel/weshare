import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { ReceiptCameraButton } from '../../../components/ui/ReceiptCameraButton';
import { Text } from '../../../components/ui/Text';
import { PaywallSheet } from '../../../shared/components/PaywallSheet';
import { useReceiptParser } from '../../../hooks/useReceiptParser';
import { useReceiptStorage } from '../../../hooks/useReceiptStorage';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { useService } from '../../../core/di/ServiceContext';
import { ENTITLEMENT } from '../../../core/di/tokens';
import type { EntitlementStatus } from '../../../core/models/Entitlement';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import { useTranslation } from 'react-i18next';

interface ReceiptCaptureProps {
  onParsed: (
    description: string,
    amountCents: number,
    lineItems: ParsedReceiptLineItem[],
    receiptPath: string | undefined,
  ) => void;
  // Scopes the OCR usage gate to a trip pass covering this trip — omit in
  // group mode, which has no trip pass concept (TODO_monetization.md Chunk E).
  tripId?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ReceiptCapture({ onParsed, tripId, disabled, style }: ReceiptCaptureProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const entitlement = useService(ENTITLEMENT);
  const { parseReceipt, parsing, error, limitReached, clearError } = useReceiptParser();
  const { uploadReceipt } = useReceiptStorage();
  // Not read directly — refreshing it and re-storing it is just this
  // component's re-render trigger for the entitlement service's own mutable
  // cache (mirrors PaywallSheet's same pattern). remainingFreeUses/
  // hasFullAccess below always read live off the service, not off `status`.
  const [status, setStatus] = useState<EntitlementStatus | null>(null);

  // Usage is authoritative server-side (see parse-receipt), but the local
  // cache needs a sync point to reflect it — once on mount (covers opening
  // this screen fresh) and again after each attempt below.
  useEffect(() => {
    let cancelled = false;
    void entitlement.refresh().then(() => {
      if (!cancelled) setStatus(entitlement.getStatus());
    });
    return () => { cancelled = true; };
  }, [entitlement]);

  const handleImageCaptured = async (imageBase64: string, mimeType: 'image/jpeg' | 'image/png') => {
    const [parsed, storagePath] = await Promise.all([
      parseReceipt(imageBase64, mimeType, tripId),
      uploadReceipt(imageBase64, mimeType),
    ]);
    await entitlement.refresh();
    setStatus(entitlement.getStatus());
    if (!parsed) return;
    onParsed(
      parsed.merchant ?? '',
      parsed.totalAmountCents,
      parsed.lineItems,
      storagePath ?? undefined,
    );
  };

  const showRemainingCount = status !== null && !entitlement.hasFullAccess(tripId);
  const remaining = entitlement.remainingFreeUses('ocr_scan');

  return (
    <View style={style}>
      <View style={{ alignItems: 'flex-end' }}>
        <ReceiptCameraButton
          onImageCaptured={handleImageCaptured}
          disabled={disabled || parsing}
        />
      </View>
      {showRemainingCount && !parsing && (
        <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.xs, textAlign: 'right' }}>
          {t('expenses.receipt.remaining_scans', { count: remaining })}
        </Text>
      )}
      {parsing && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          padding: tokens.spacing.sm,
          backgroundColor: colors.primary.subtle,
          borderRadius: tokens.radius.md,
          marginTop: tokens.spacing.sm,
        }}>
          <ActivityIndicator size="small" color={colors.primary.default} />
          <Text variant="caption" color={colors.primary.default}>{t('expenses.receipt.reading')}</Text>
        </View>
      )}
      {error && (
        <Pressable
          onPress={clearError}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: tokens.spacing.sm,
            backgroundColor: colors.error.bg,
            borderRadius: tokens.radius.md,
            marginTop: tokens.spacing.sm,
          }}
        >
          <Text variant="caption" color={colors.error.default} style={{ flex: 1 }}>
            {t('expenses.receipt.error')}
          </Text>
          <Text variant="caption" color={colors.error.default}>✕</Text>
        </Pressable>
      )}
      <PaywallSheet
        visible={limitReached}
        onClose={clearError}
        tripId={tripId}
        onPurchased={() => {
          clearError();
          void entitlement.refresh().then(() => setStatus(entitlement.getStatus()));
        }}
      />
    </View>
  );
}
