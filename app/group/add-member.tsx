import React, { useState, useCallback } from 'react';
import {
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../src/components/ui/UniversalTabBar';
import { Text } from '../../src/components/ui/Text';
import { HeaderConfirmButton } from '../../src/components/ui';
import { AddMemberNameField } from '../../src/components/ui/AddMemberNameField';
import { ContactsPickerList } from '../../src/components/ui/ContactsPickerList';
import { CurrentMembersList } from '../../src/components/ui/CurrentMembersList';
import type { ContactItem } from '../../src/components/ui/ContactsPickerList';
import { useGroupDetail } from '../../src/features/groups/hooks/useGroupDetail';
import { useAddGroupMember } from '../../src/features/groups/hooks/useAddGroupMember';
import { generateId } from '../../src/core/utils/generateId';
import { useColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';
import type { GroupMember } from '../../src/core/models/GroupMember';

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function GroupAddMemberScreen() {
  const { t }       = useTranslation();
  const colors      = useColors();
  const router      = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const { group } = useGroupDetail(groupId);
  const { addMember } = useAddGroupMember(groupId);

  const [localMembers,  setLocalMembers]  = useState<GroupMember[]>([]);

  // Sync from store on first load
  React.useEffect(() => {
    if (group) setLocalMembers(group.members);
  }, [group?.id]);

  const handleAdded = useCallback((member: GroupMember) => {
    setLocalMembers(prev => [...prev, member]);
  }, []);

  const handleManualAdd = useCallback(async (name: string) => {
    const saved = await addMember({ displayName: name });
    if (!saved) return false;
    handleAdded(saved);
    return true;
  }, [addMember, handleAdded]);

  // ── Contacts state ──────────────────────────────────────────────────────────

  const [contactsExpanded,   setContactsExpanded]   = useState(false);
  const [contactsPermission, setContactsPermission] = useState<string | null>(null);
  const [contactList,        setContactList]        = useState<ContactItem[]>([]);
  const [contactsLoading,    setContactsLoading]    = useState(false);
  const [contactQuery,       setContactQuery]       = useState('');
  const [addedContactIds,    setAddedContactIds]    = useState<Set<string>>(new Set());
  const [addingContactId,    setAddingContactId]    = useState<string | null>(null);

  const handleToggleContacts = useCallback(async () => {
    const opening = !contactsExpanded;
    setContactsExpanded(opening);
    if (opening && contactsPermission === null) {
      setContactsLoading(true);
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status);
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        });
        const items: ContactItem[] = data
          .filter(c => c.name)
          .map(c => ({
            id:    c.id ?? generateId(),
            name:  c.name!,
            phone: c.phoneNumbers?.[0]?.number ?? undefined,
            email: c.emails?.[0]?.email ?? undefined,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setContactList(items);
      }
      setContactsLoading(false);
    }
  }, [contactsExpanded, contactsPermission]);

  const handleAddContact = useCallback(async (contact: ContactItem) => {
    setAddingContactId(contact.id);
    const saved = await addMember({ displayName: contact.name, phone: contact.phone, email: contact.email });
    setAddingContactId(null);
    if (saved) {
      handleAdded(saved);
      setAddedContactIds(prev => new Set(prev).add(contact.id));
    }
  }, [addMember, handleAdded]);

  if (!group) return null;

  const doneButton = () => (
    <HeaderConfirmButton
      onPress={() => router.back()}
      disabled={false}
      loading={false}
      accessibilityLabel={t('invite.add_participants.done_label')}
    />
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('groups.add_member.title'), headerRight: doneButton }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT }}
          ListHeaderComponent={
            <>
              <Text variant="heading2" style={{ marginBottom: tokens.spacing.xs }}>
                {t('groups.add_member.heading')}
              </Text>
              <Text variant="body" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
                {t('groups.add_member.subtitle', { group_name: group.name })}
              </Text>

              <CurrentMembersList
                members={localMembers}
                countLabel={t('groups.add_member.member_count', { count: localMembers.length })}
              />

              <AddMemberNameField
                existingNames={localMembers.map(m => m.displayName)}
                onAdd={handleManualAdd}
                placeholder={t('groups.add_member.name_placeholder')}
                addButtonLabel={t('groups.add_member.add_button')}
                duplicateErrorLabel={t('groups.add_member.duplicate_error')}
                genericErrorLabel={t('groups.add_member.add_error')}
                fieldAccessibilityLabel={t('groups.add_member.name_placeholder')}
              />

              {/* Contacts toggle */}
              <Pressable
                onPress={handleToggleContacts}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
                  paddingVertical: tokens.spacing.sm, marginBottom: tokens.spacing.xs,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.primary.default} />
                <Text variant="label" color={colors.primary.default} style={{ flex: 1 }}>
                  {t('invite.add_participants.contacts_toggle')}
                </Text>
                <Ionicons
                  name={contactsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.primary.default}
                />
              </Pressable>
              <Text variant="caption" color={colors.text.tertiary} style={{ marginBottom: tokens.spacing.sm }}>
                {t('groups.add_member.privacy_notice')}
              </Text>

              {contactsExpanded && (
                <ContactsPickerList
                  permission={contactsPermission ?? ''}
                  contacts={contactList}
                  loading={contactsLoading}
                  query={contactQuery}
                  onQueryChange={setContactQuery}
                  existingMembers={localMembers}
                  addedIds={addedContactIds}
                  addingId={addingContactId}
                  onAddContact={handleAddContact}
                  permissionHintLabel={t('invite.add_participants.contacts_permission_hint')}
                  searchPlaceholder={t('invite.add_participants.contacts_search')}
                  searchAccessibilityLabel={t('invite.add_participants.contacts_search')}
                  noMatchLabel={t('invite.add_participants.contacts_no_match')}
                  emptyLabel={t('invite.add_participants.contacts_empty')}
                />
              )}
            </>
          }
        />
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
