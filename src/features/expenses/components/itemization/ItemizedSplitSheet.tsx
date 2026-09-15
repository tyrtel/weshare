import React from 'react';
import { Modal, View, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../../../components/ui/Text';
import { useColors } from '../../../../theme/colors';
import { tokens, ledgerRadius } from '../../../../theme/tokens';
import { ITEMIZED_SPLIT_EDITORS, DEFAULT_ITEMIZED_SPLIT_EDITOR, type ItemizedSplitEditorKey } from './registry';
import type { ItemizedSplitEditorProps } from './types';

interface ItemizedSplitSheetProps {
  visible: boolean;
  onClose: () => void;
  onClearItems: () => void;
  editorKey?: ItemizedSplitEditorKey;
  editorProps: ItemizedSplitEditorProps;
}

// Chrome around whichever itemized-split editor the registry resolves for
// editorKey — the sheet itself knows nothing about item entry or assignment,
// only how to present one editor full-screen-ish with a title and a way out.
export function ItemizedSplitSheet({
  visible, onClose, onClearItems, editorKey = DEFAULT_ITEMIZED_SPLIT_EDITOR, editorProps,
}: ItemizedSplitSheetProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const Editor = ITEMIZED_SPLIT_EDITORS[editorKey];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <Animated.View
          testID="itemized-split-sheet"
          entering={SlideInDown.springify().damping(22).stiffness(200)}
          exiting={SlideOutDown.duration(220)}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text variant="heading2">{t('expenses.form.itemized_sheet_title')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              {editorProps.items.length > 0 && (
                <Pressable testID="itemized-sheet-clear" onPress={onClearItems} hitSlop={8}>
                  <Text variant="caption" color={colors.text.secondary}>{t('expenses.form.clear_items')}</Text>
                </Pressable>
              )}
              <Pressable
                testID="itemized-sheet-done-button"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('expenses.form.itemized_sheet_done')}
                hitSlop={8}
              >
                <Feather name="check" size={20} color={colors.primary.default} />
              </Pressable>
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '100%' }}>
            <Editor {...editorProps} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85%',
  },
  sheet: {
    borderTopLeftRadius: ledgerRadius.card,
    borderTopRightRadius: ledgerRadius.card,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl + 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center',
    marginBottom: tokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.md,
  },
});
