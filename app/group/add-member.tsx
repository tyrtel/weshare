import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
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
import { Avatar } from '../../src/components/ui';
import { Divider } from '../../src/components/ui/Divider';
import { useGroupDetail } from '../../src/features/groups/hooks/useGroupDetail';
import { useService } from '../../src/core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../src/core/di/tokens';
import { generateId } from '../../src/core/utils/generateId';
import { useColors, personColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';
import { isOk } from '../../src/core/types/Result';
import type { GroupMember } from '../../src/core/models/GroupMember';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function namePalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return personColors[hash % personColors.length];
}

function isAlreadyAdded(name: string, phone: string | undefined, members: GroupMember[]): boolean {
  return members.some(
    m => m.displayName.toLowerCase() === name.toLowerCase() || (phone != null && m.phone === phone),
  );
}

interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

// ── Current members ────────────────────────────────────────────────────────────

function CurrentMembersSection({ members }: { members: GroupMember[] }) {
  const { t } = useTranslation();
  const colors = useColors();
  if (members.length === 0) return null;
  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
        {t('groups.add_member.member_count', { count: members.length })}
      </Text>
      {members.map((m, i) => {
        const palette = personColors[i % personColors.length];
        return (
          <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm }}>
            <Avatar initials={getInitials(m.displayName)} bg={palette.text} url={m.avatarUrl} size="sm" />
            <Text variant="body" style={{ marginLeft: tokens.spacing.sm }}>{m.displayName}</Text>
          </View>
        );
      })}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: tokens.spacing.xs }} />
    </View>
  );
}

// ── Manual add ─────────────────────────────────────────────────────────────────

interface ManualAddProps {
  groupId: string;
  members: GroupMember[];
  onAdded: (member: GroupMember) => void;
}

function ManualAddSection({ groupId, members, onAdded }: ManualAddProps) {
  const { t }      = useTranslation();
  const colors     = useColors();
  const groupRepo  = useService(GROUP_REPO);
  const store      = useService(TRIP_STORE);

  const [name,   setName]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const isDuplicate = name.trim().length > 0 &&
    members.some(m => m.displayName.toLowerCase() === name.trim().toLowerCase());

  const handleAdd = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const member: GroupMember = {
      userId:      `guest_${generateId()}`,
      groupId,
      displayName: trimmed,
      isGuest:     true,
      joinedAt:    new Date(),
    };
    const result = await groupRepo.addMember(member);
    setSaving(false);
    if (isOk(result)) {
      store.getState().addMemberToGroupInStore(groupId, result.value);
      onAdded(result.value);
      setName('');
    } else {
      setError(t('groups.add_member.add_error'));
    }
  }, [name, groupId, groupRepo, store, onAdded, t]);

  return (
    <View style={{ marginBottom: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput
          value={name}
          onChangeText={text => { setName(text); setError(null); }}
          placeholder={t('groups.add_member.name_placeholder')}
          placeholderTextColor={colors.text.tertiary}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderColor: isDuplicate ? colors.error.default : colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            color: colors.text.primary,
            fontSize: tokens.fontSize.md,
          }}
          accessibilityLabel={t('groups.add_member.name_placeholder')}
        />
        <Pressable
          onPress={handleAdd}
          disabled={!name.trim() || saving || isDuplicate}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: colors.primary.default,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: (!name.trim() || saving || isDuplicate) ? 0.4 : pressed ? 0.8 : 1,
          })}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text variant="label" color="#ffffff">{t('groups.add_member.add_button')}</Text>}
        </Pressable>
      </View>
      {isDuplicate && (
        <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
          {t('groups.add_member.duplicate_error')}
        </Text>
      )}
      {error && (
        <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
          {error}
        </Text>
      )}
    </View>
  );
}

// ── Contacts list ──────────────────────────────────────────────────────────────

interface ContactsContentProps {
  permission: string;
  contacts: ContactItem[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  members: GroupMember[];
  addedIds: Set<string>;
  addingId: string | null;
  onAdd: (contact: ContactItem) => void;
}

function ContactsContent({
  permission, contacts, loading, query, onQueryChange,
  members, addedIds, addingId, onAdd,
}: ContactsContentProps) {
  const { t }  = useTranslation();
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
        <Text variant="body" color={colors.text.secondary}>{t('invite.add_participants.contacts_permission_hint')}</Text>
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
        placeholder={t('invite.add_participants.contacts_search')}
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
        accessibilityLabel={t('invite.add_participants.contacts_search')}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const alreadyAdded = addedIds.has(item.id) || isAlreadyAdded(item.name, item.phone, members);
          const isAdding     = addingId === item.id;
          return (
            <Pressable
              onPress={() => !alreadyAdded && onAdd(item)}
              disabled={alreadyAdded || isAdding}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: tokens.spacing.sm,
                opacity: alreadyAdded ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <Avatar initials={getInitials(item.name)} bg={namePalette(item.name).text} size="sm" />
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
            {query ? t('invite.add_participants.contacts_no_match') : t('invite.add_participants.contacts_empty')}
          </Text>
        }
      />
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function GroupAddMemberScreen() {
  const { t }       = useTranslation();
  const colors      = useColors();
  const router      = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const { group } = useGroupDetail(groupId);
  const groupRepo = useService(GROUP_REPO);
  const store     = useService(TRIP_STORE);

  const [localMembers,  setLocalMembers]  = useState<GroupMember[]>([]);

  // Sync from store on first load
  React.useEffect(() => {
    if (group) setLocalMembers(group.members);
  }, [group?.id]);

  const handleAdded = useCallback((member: GroupMember) => {
    setLocalMembers(prev => [...prev, member]);
  }, []);

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
    const member: GroupMember = {
      userId:      `guest_${generateId()}`,
      groupId,
      displayName: contact.name,
      isGuest:     true,
      joinedAt:    new Date(),
      phone:       contact.phone,
      email:       contact.email,
    };
    const result = await groupRepo.addMember(member);
    setAddingContactId(null);
    if (isOk(result)) {
      store.getState().addMemberToGroupInStore(groupId, result.value);
      handleAdded(result.value);
      setAddedContactIds(prev => new Set(prev).add(contact.id));
    }
  }, [groupId, groupRepo, store, handleAdded]);

  if (!group) return null;

  const doneButton = () => (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={t('invite.add_participants.done_label')}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: colors.primary.default,
        alignItems: 'center', justifyContent: 'center',
        marginRight: tokens.spacing.xs, opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="checkmark" size={20} color="#fff" />
    </Pressable>
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

              <CurrentMembersSection members={localMembers} />

              <ManualAddSection groupId={groupId} members={localMembers} onAdded={handleAdded} />

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
                <ContactsContent
                  permission={contactsPermission ?? ''}
                  contacts={contactList}
                  loading={contactsLoading}
                  query={contactQuery}
                  onQueryChange={setContactQuery}
                  members={localMembers}
                  addedIds={addedContactIds}
                  addingId={addingContactId}
                  onAdd={handleAddContact}
                />
              )}
            </>
          }
        />
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
