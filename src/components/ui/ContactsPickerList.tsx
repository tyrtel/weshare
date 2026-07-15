import React from 'react';
import { View, TextInput, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { Divider } from './Divider';
import { useColors, personColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { getInitials } from '../../core/utils/getInitials';

export interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

function contactPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return personColors[hash % personColors.length];
}

function isAlreadyAdded(name: string, phone: string | undefined, members: { displayName: string; phone?: string }[]): boolean {
  return members.some(
    m => m.displayName.toLowerCase() === name.toLowerCase() || (phone != null && m.phone === phone),
  );
}

interface ContactsPickerListProps {
  permission: string;
  contacts: ContactItem[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  existingMembers: { displayName: string; phone?: string }[];
  addedIds: Set<string>;
  addingId: string | null;
  onAddContact: (contact: ContactItem) => void;
  permissionHintLabel: string;
  searchPlaceholder: string;
  searchAccessibilityLabel: string;
  noMatchLabel: string;
  emptyLabel: string;
  alreadyAddedAccessibilityLabel?: (name: string) => string;
  addAccessibilityLabel?: (name: string) => string;
}

export function ContactsPickerList({
  permission,
  contacts,
  loading,
  query,
  onQueryChange,
  existingMembers,
  addedIds,
  addingId,
  onAddContact,
  permissionHintLabel,
  searchPlaceholder,
  searchAccessibilityLabel,
  noMatchLabel,
  emptyLabel,
  alreadyAddedAccessibilityLabel,
  addAccessibilityLabel,
}: ContactsPickerListProps) {
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: tokens.spacing.md }}>
        <ActivityIndicator color={colors.primary.default} />
      </View>
    );
  }

  if (permission !== 'granted') {
    return (
      <View style={{ padding: tokens.spacing.md, backgroundColor: colors.surface, borderRadius: tokens.radius.md, marginBottom: tokens.spacing.md }}>
        <Text variant="body" color={colors.text.secondary}>{permissionHintLabel}</Text>
      </View>
    );
  }

  const filtered = query.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : contacts;

  return (
    <View style={{ marginBottom: tokens.spacing.md }}>
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.text.tertiary}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: tokens.radius.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
          color: colors.text.primary,
          fontSize: tokens.fontSize.md,
          marginBottom: tokens.spacing.xs,
        }}
        accessibilityLabel={searchAccessibilityLabel}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const alreadyAdded = addedIds.has(item.id) || isAlreadyAdded(item.name, item.phone, existingMembers);
          const isAdding     = addingId === item.id;
          return (
            <Pressable
              onPress={() => !alreadyAdded && onAddContact(item)}
              disabled={alreadyAdded || isAdding}
              accessibilityRole="button"
              accessibilityLabel={
                alreadyAdded
                  ? alreadyAddedAccessibilityLabel?.(item.name)
                  : addAccessibilityLabel?.(item.name)
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: tokens.spacing.sm,
                opacity: alreadyAdded ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <Avatar initials={getInitials(item.name)} bg={contactPalette(item.name).bg} size="sm" />
              <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                <Text variant="body">{item.name}</Text>
                {(item.phone ?? item.email) ? (
                  <Text variant="caption" color={colors.text.secondary}>{item.phone ?? item.email}</Text>
                ) : null}
              </View>
              {isAdding ? (
                <ActivityIndicator size="small" color={colors.primary.default} />
              ) : alreadyAdded ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.success.default} />
              ) : (
                <Ionicons name="add-circle-outline" size={20} color={colors.primary.default} />
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <Divider />}
        scrollEnabled={false}
        ListEmptyComponent={
          <Text variant="caption" color={colors.text.secondary} style={{ textAlign: 'center', paddingVertical: tokens.spacing.md }}>
            {query ? noMatchLabel : emptyLabel}
          </Text>
        }
      />
    </View>
  );
}
