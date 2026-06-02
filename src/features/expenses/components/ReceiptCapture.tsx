import React from 'react';
import { View, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { ReceiptCameraButton } from '../../../components/ui/ReceiptCameraButton';
import { Text } from '../../../components/ui/Text';
import { useReceiptParser } from '../../../hooks/useReceiptParser';
import { useReceiptStorage } from '../../../hooks/useReceiptStorage';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';

interface ReceiptCaptureProps {
  onParsed: (
    description: string,
    amountCents: number,
    lineItems: ParsedReceiptLineItem[],
    receiptPath: string | undefined,
  ) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ReceiptCapture({ onParsed, disabled, style }: ReceiptCaptureProps) {
  const colors = useColors();
  const { parseReceipt, parsing, error, clearError } = useReceiptParser();
  const { uploadReceipt } = useReceiptStorage();

  const handleImageCaptured = async (imageBase64: string, mimeType: 'image/jpeg' | 'image/png') => {
    const [parsed, storagePath] = await Promise.all([
      parseReceipt(imageBase64, mimeType),
      uploadReceipt(imageBase64, mimeType),
    ]);
    if (!parsed) return;
    onParsed(
      parsed.merchant ?? '',
      parsed.totalAmountCents,
      parsed.lineItems,
      storagePath ?? undefined,
    );
  };

  return (
    <View style={style}>
      <View style={{ alignItems: 'flex-end' }}>
        <ReceiptCameraButton
          onImageCaptured={handleImageCaptured}
          disabled={disabled || parsing}
        />
      </View>
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
          <Text variant="caption" color={colors.primary.default}>Reading receipt…</Text>
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
            Couldn't read receipt — please fill in manually
          </Text>
          <Text variant="caption" color={colors.error.default}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}
