import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Pressable, Image, Modal, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { useReceiptStorage } from '../../hooks/useReceiptStorage';
import { ledgerColors } from '../../theme/colors';
import { ledgerRadius } from '../../theme/tokens';

interface ExpenseReceiptSectionProps {
  receiptPath: string | undefined;
}

export function ExpenseReceiptSection({ receiptPath }: ExpenseReceiptSectionProps) {
  const { t } = useTranslation();
  const { getReceiptUrl } = useReceiptStorage();
  const [receiptUrl,        setReceiptUrl]        = useState<string | null>(null);
  const [receiptImgLoaded,  setReceiptImgLoaded]  = useState(false);
  const [receiptFullscreen, setReceiptFullscreen] = useState(false);

  useEffect(() => {
    if (!receiptPath) return;
    getReceiptUrl(receiptPath).then(url => { if (url) setReceiptUrl(url); });
  }, [receiptPath, getReceiptUrl]);

  if (!receiptPath) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{t('expenses.detail.receipt_label')}</Text>
      {!receiptUrl ? (
        <View style={styles.receiptBox}>
          <ActivityIndicator color={ledgerColors.primary.default} />
        </View>
      ) : (
        <Pressable
          onPress={() => setReceiptFullscreen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('expenses.detail.view_receipt_label')}
        >
          <Image
            source={{ uri: receiptUrl }}
            style={styles.receiptBox}
            resizeMode="contain"
            accessibilityLabel={t('expenses.detail.receipt_image_label')}
            onLoad={() => setReceiptImgLoaded(true)}
          />
          {!receiptImgLoaded && (
            <View style={[styles.receiptBox, { position: 'absolute', top: 0, left: 0 }]}>
              <ActivityIndicator color={ledgerColors.primary.default} />
            </View>
          )}
          {receiptImgLoaded && (
            <View style={styles.receiptExpandBadge}>
              <Feather name="maximize-2" size={16} color="#fff" />
            </View>
          )}
        </Pressable>
      )}

      <Modal
        visible={receiptFullscreen}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setReceiptFullscreen(false)}
        statusBarTranslucent
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <Pressable
            onPress={() => setReceiptFullscreen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('expenses.detail.close_receipt_label')}
            style={styles.receiptCloseBtn}
          >
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          <Image
            source={{ uri: receiptUrl ?? undefined }}
            style={{ flex: 1 }}
            resizeMode="contain"
            accessibilityLabel={t('expenses.detail.receipt_fullscreen_label')}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: ledgerColors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  receiptBox: {
    width: '100%', height: 220,
    borderRadius: ledgerRadius.card,
    backgroundColor: ledgerColors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  receiptExpandBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 6,
  },
  receiptCloseBtn: {
    position: 'absolute', top: 24, right: 16, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: 8,
  },
});
