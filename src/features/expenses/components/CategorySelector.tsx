import React, { useState } from 'react';
import { View, Pressable, Modal, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { EXPENSE_CATEGORIES, categoryById } from '../utils/categories';
import type { ExpenseCategory } from '../utils/categories';

interface CategorySelectorProps {
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
}

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const selected = categoryById(value);
  const hasCategory = !!selected;

  function handleSelect(cat: ExpenseCategory) {
    onChange(cat.id);
    setOpen(false);
  }

  function handleClear() {
    onChange(undefined);
    setOpen(false);
  }

  return (
    <>
      {/* Inline row — faded when no category, normal when set */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Category: ${selected.label}. Tap to change.` : 'Add category'}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          paddingVertical: tokens.spacing.sm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons
          name={(selected?.icon ?? 'pricetag-outline') as any}
          size={16}
          color={hasCategory ? colors.primary.default : colors.text.tertiary}
        />
        <Text
          variant="caption"
          color={hasCategory ? colors.text.primary : colors.text.tertiary}
          style={{ flex: 1 }}
        >
          {selected ? selected.label : 'No category'}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
      </Pressable>

      {/* Bottom sheet picker */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setOpen(false)}
        />
        <SafeAreaView style={{ backgroundColor: colors.background }}>
          <View style={{
            paddingHorizontal: tokens.spacing.md,
            paddingTop: tokens.spacing.md,
            paddingBottom: tokens.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text variant="label" color={colors.text.secondary}>Category</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.text.secondary} />
            </Pressable>
          </View>

          <FlatList
            data={EXPENSE_CATEGORIES}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const isSelected = item.id === value;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: tokens.spacing.md,
                    paddingVertical: tokens.spacing.md,
                    paddingHorizontal: tokens.spacing.md,
                    backgroundColor: isSelected ? colors.primary.subtle : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={isSelected ? colors.primary.default : colors.text.secondary}
                  />
                  <Text
                    variant="body"
                    color={isSelected ? colors.primary.default : colors.text.primary}
                    style={{ flex: 1 }}
                  >
                    {item.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={colors.primary.default} />
                  )}
                </Pressable>
              );
            }}
            ListFooterComponent={
              hasCategory ? (
                <Pressable
                  onPress={handleClear}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: tokens.spacing.md,
                    paddingVertical: tokens.spacing.md,
                    paddingHorizontal: tokens.spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.text.tertiary} />
                  <Text variant="body" color={colors.text.tertiary}>Remove category</Text>
                </Pressable>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
