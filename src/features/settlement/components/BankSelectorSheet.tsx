import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Pressable, FlatList, TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useService } from '../../../core/di/ServiceContext';
import { BANK_LIST } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Bank } from '../../../core/interfaces/IBankListService';

const TINK_MARKET = 'FR';

interface BankSelectorSheetProps {
  visible:    boolean;
  onSelect:   (bank: Bank) => void;
  onClose:    () => void;
}

export function BankSelectorSheet({ visible, onSelect, onClose }: BankSelectorSheetProps) {
  const colors      = useColors();
  const bankService = useService(BANK_LIST);

  const [banks, setBanks]     = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    bankService.getBanks(TINK_MARKET).then((result) => {
      if (isOk(result)) setBanks(result.value);
      setLoading(false);
    });
  }, [visible, bankService]);

  const filtered = useMemo(() => {
    if (!query.trim()) return banks;
    const lower = query.toLowerCase();
    return banks.filter((b) => b.name.toLowerCase().includes(lower));
  }, [banks, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Close bank selector" />

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <Text variant="heading3" style={{ paddingHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.sm }}>
            Select your bank
          </Text>

          {/* Search */}
          <View
            style={{
              marginHorizontal: tokens.spacing.lg,
              marginBottom:     tokens.spacing.sm,
              flexDirection:    'row',
              alignItems:       'center',
              backgroundColor:  colors.surfaceAlt,
              borderRadius:     tokens.radius.md,
              paddingHorizontal: tokens.spacing.sm,
            }}
          >
            <Ionicons name="search" size={16} color={colors.text.tertiary} style={{ marginRight: tokens.spacing.xs }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search banks…"
              placeholderTextColor={colors.text.tertiary}
              style={{ flex: 1, color: colors.text.primary, paddingVertical: tokens.spacing.sm, fontSize: 14 }}
              autoCorrect={false}
              accessibilityLabel="Search banks"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary.default} style={{ marginVertical: tokens.spacing.xl }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.lg }}
              ListEmptyComponent={
                <Text variant="body" color={colors.text.tertiary} style={{ textAlign: 'center', marginTop: tokens.spacing.lg }}>
                  No banks found
                </Text>
              }
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => { onSelect(item); onClose(); }}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  style={({ pressed }) => ({
                    flexDirection:     'row',
                    alignItems:        'center',
                    paddingVertical:   tokens.spacing.sm,
                    borderBottomWidth: index < filtered.length - 1 ? 1 : 0,
                    borderBottomColor: colors.borderMuted,
                    opacity:           pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width:           36,
                      height:          36,
                      borderRadius:    tokens.radius.sm,
                      backgroundColor: colors.surfaceAlt,
                      alignItems:      'center',
                      justifyContent:  'center',
                      marginRight:     tokens.spacing.sm,
                    }}
                  >
                    <Ionicons name="business-outline" size={18} color={colors.text.secondary} />
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
              )}
            />
          )}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Skip bank selection"
            style={({ pressed }) => ({
              alignItems:       'center',
              paddingVertical:  tokens.spacing.md,
              marginBottom:     tokens.spacing.lg,
              opacity:          pressed ? 0.7 : 1,
            })}
          >
            <Text variant="label" color={colors.text.secondary}>Skip — proceed without selecting</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius:  tokens.radius.card,
    borderTopRightRadius: tokens.radius.card,
  },
  handleContainer: {
    alignItems:    'center',
    paddingTop:    tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  handle: {
    width:        40,
    height:       4,
    borderRadius: 2,
  },
});
