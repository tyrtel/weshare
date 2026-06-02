import React, { useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { generateProofHTML } from '../../core/utils/generateProofHTML';
import type { SplitRequest } from '../../core/models/SplitRequest';

interface PaymentProofCardProps {
  splitRequest: SplitRequest;
  payerName?: string;
  payeeName?: string;
}

export function PaymentProofCard({ splitRequest, payerName, payeeName }: PaymentProofCardProps) {
  const colors   = useColors();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html      = generateProofHTML(splitRequest, { payerName, payeeName });
      const { uri }   = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Payment Proof',
        UTI:         'com.adobe.pdf',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.primary.subtle,
        borderRadius:    tokens.radius.md,
        padding:         tokens.spacing.md,
        gap:             tokens.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
        <Ionicons name="document-text-outline" size={18} color={colors.primary.default} />
        <Text variant="label" color={colors.primary.default}>Payment confirmed</Text>
      </View>

      <Text variant="caption" color={colors.text.secondary}>
        Your payment has been processed. Download a PDF proof for your records.
      </Text>

      <Pressable
        onPress={() => void handleExport()}
        disabled={exporting}
        accessibilityRole="button"
        accessibilityLabel="Download payment proof PDF"
        style={({ pressed }) => ({
          flexDirection:   'row',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             tokens.spacing.sm,
          backgroundColor: colors.primary.default,
          borderRadius:    tokens.radius.pill,
          paddingVertical: tokens.spacing.sm,
          opacity:         pressed || exporting ? 0.7 : 1,
          marginTop:       tokens.spacing.xs,
        })}
      >
        {exporting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="download-outline" size={15} color="#fff" />
            <Text variant="caption" color="#fff">Download proof</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
