import React, { useState, useCallback } from 'react';
import {
  View, TextInput, ScrollView, Pressable, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { ErrorBanner } from '../../src/components/ui/ErrorBanner';
import { Text } from '../../src/components/ui/Text';
import { Avatar } from '../../src/components/ui';
import { CurrencyPicker } from '../../src/components/ui/CurrencyPicker';
import { HeaderConfirmButton } from '../../src/components/ui/HeaderConfirmButton';
import { LabeledTextInput } from '../../src/components/ui/LabeledTextInput';
import { Divider } from '../../src/components/ui/Divider';
import { useCreateGroup } from '../../src/features/groups/hooks/useCreateGroup';
import { PaywallSheet } from '../../src/shared/components/PaywallSheet';
import { useService } from '../../src/core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../src/core/di/tokens';
import { generateId } from '../../src/core/utils/generateId';
import { isOk } from '../../src/core/types/Result';
import { useColors, personColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';
import type { GroupMember } from '../../src/core/models/GroupMember';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PendingMember {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
}

interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function CreateGroupScreen() {
  const { t }      = useTranslation();
  const router     = useRouter();
  const colors     = useColors();
  const groupRepo  = useService(GROUP_REPO);
  const store      = useService(TRIP_STORE);
  const { createGroup, loading, error, limitReached, clearLimitReached } = useCreateGroup();

  // ── Form state ──────────────────────────────────────────────────────────────

  const [name,     setName]     = useState('');
  const [currency, setCurrency] = useState('EUR');

  // ── Pending members state ───────────────────────────────────────────────────

  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [memberInput,    setMemberInput]    = useState('');

  const isDuplicateMember = memberInput.trim().length > 0 &&
    pendingMembers.some(m => m.displayName.toLowerCase() === memberInput.trim().toLowerCase());

  const handleAddMember = useCallback(() => {
    const trimmed = memberInput.trim();
    if (!trimmed || isDuplicateMember) return;
    setPendingMembers(prev => [...prev, { id: generateId(), displayName: trimmed }]);
    setMemberInput('');
  }, [memberInput, isDuplicateMember]);

  const handleRemoveMember = useCallback((id: string) => {
    setPendingMembers(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Contacts state ──────────────────────────────────────────────────────────

  const [contactsExpanded,   setContactsExpanded]   = useState(false);
  const [contactsPermission, setContactsPermission] = useState<string | null>(null);
  const [contactList,        setContactList]        = useState<ContactItem[]>([]);
  const [contactsLoading,    setContactsLoading]    = useState(false);
  const [contactQuery,       setContactQuery]       = useState('');

  const addedContactIds = new Set(pendingMembers.map(m => m.id));

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

  const handleAddContact = useCallback((contact: ContactItem) => {
    const alreadyPending = pendingMembers.some(
      m => m.id === contact.id ||
           m.displayName.toLowerCase() === contact.name.toLowerCase() ||
           (contact.phone != null && m.phone === contact.phone),
    );
    if (alreadyPending) return;
    setPendingMembers(prev => [
      ...prev,
      { id: contact.id, displayName: contact.name, phone: contact.phone, email: contact.email },
    ]);
  }, [pendingMembers]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const group = await createGroup(name, currency);
    if (!group) return;
    await Promise.all(
      pendingMembers.map(async pm => {
        const member: GroupMember = {
          userId:      `guest_${generateId()}`,
          groupId:     group.id,
          displayName: pm.displayName,
          isGuest:     true,
          joinedAt:    new Date(),
          phone:       pm.phone,
          email:       pm.email,
        };
        const result = await groupRepo.addMember(member);
        if (isOk(result)) {
          store.getState().addMemberToGroupInStore(group.id, result.value);
        }
      }),
    );
    router.replace(`/group/${group.id}` as Parameters<typeof router.replace>[0]);
  };

  // ── UI helpers ──────────────────────────────────────────────────────────────

  const isValid = !loading && !!name.trim();

  const filteredContacts = contactQuery.trim()
    ? contactList.filter(c => c.name.toLowerCase().includes(contactQuery.trim().toLowerCase()))
    : contactList;

  const confirmButton = () => (
    <HeaderConfirmButton
      onPress={handleSubmit}
      disabled={!isValid}
      loading={loading}
      accessibilityLabel={t('groups.create.confirm_label')}
    />
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('groups.create.title'), headerRight: confirmButton }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            {t('groups.create.heading')}
          </Text>

          {/* Group name */}
          <LabeledTextInput
            label={t('groups.form.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.form.name_placeholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel={t('groups.form.name_accessibility')}
          />

          {/* Currency */}
          <CurrencyPicker
            currency={currency}
            onSelect={setCurrency}
            fieldLabel={t('groups.form.currency_label')}
            selectLabel={t('groups.form.currency_select_label')}
            selectHeading={t('groups.form.currency_select_heading')}
            closeLabel={t('groups.form.currency_close_label')}
          />

          {/* Members section */}
          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
            {t('groups.add_member.heading')}
          </Text>

          {/* Pending member chips */}
          {pendingMembers.length > 0 && (
            <View style={{ marginBottom: tokens.spacing.sm }}>
              {pendingMembers.map((m, i) => {
                const palette = personColors[i % personColors.length];
                return (
                  <View
                    key={m.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: tokens.spacing.xs,
                    }}
                  >
                    <Avatar initials={getInitials(m.displayName)} bg={palette.bg} size="sm" />
                    <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                      <Text variant="body">{m.displayName}</Text>
                      {(m.phone ?? m.email) ? (
                        <Text variant="caption" color={colors.text.secondary}>
                          {m.phone ?? m.email}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => handleRemoveMember(m.id)}
                      accessibilityRole="button"
                      hitSlop={8}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    >
                      <Ionicons name="close-circle-outline" size={20} color={colors.text.tertiary} />
                    </Pressable>
                  </View>
                );
              })}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: tokens.spacing.xs }} />
            </View>
          )}

          {/* Manual add row */}
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginBottom: tokens.spacing.xs }}>
            <TextInput
              value={memberInput}
              onChangeText={text => setMemberInput(text)}
              placeholder={t('groups.add_member.name_placeholder')}
              placeholderTextColor={colors.text.tertiary}
              returnKeyType="done"
              onSubmitEditing={handleAddMember}
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderColor: isDuplicateMember ? colors.error.default : colors.border,
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
              onPress={handleAddMember}
              disabled={!memberInput.trim() || isDuplicateMember}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: colors.primary.default,
                borderRadius: tokens.radius.md,
                paddingHorizontal: tokens.spacing.md,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: (!memberInput.trim() || isDuplicateMember) ? 0.4 : pressed ? 0.8 : 1,
              })}
            >
              <Text variant="label" color={colors.text.inverse}>{t('groups.add_member.add_button')}</Text>
            </Pressable>
          </View>
          {isDuplicateMember && (
            <Text variant="caption" color={colors.error.default} style={{ marginBottom: tokens.spacing.xs }}>
              {t('groups.add_member.duplicate_error')}
            </Text>
          )}

          {/* Contacts toggle */}
          <Pressable
            onPress={handleToggleContacts}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
              paddingVertical: tokens.spacing.sm, marginTop: tokens.spacing.xs,
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

          {/* Contacts content */}
          {contactsExpanded && (
            contactsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: tokens.spacing.md }}>
                <ActivityIndicator color={colors.primary.default} />
              </View>
            ) : contactsPermission !== 'granted' ? (
              <View style={{
                padding: tokens.spacing.md, backgroundColor: colors.surface,
                borderRadius: tokens.radius.md, marginBottom: tokens.spacing.md,
              }}>
                <Text variant="body" color={colors.text.secondary}>
                  {t('invite.add_participants.contacts_permission_hint')}
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: tokens.spacing.md }}>
                <TextInput
                  value={contactQuery}
                  onChangeText={setContactQuery}
                  placeholder={t('invite.add_participants.contacts_search')}
                  placeholderTextColor={colors.text.tertiary}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border, borderWidth: 1,
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
                  data={filteredContacts}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const alreadyAdded = addedContactIds.has(item.id) ||
                      pendingMembers.some(m => m.displayName.toLowerCase() === item.name.toLowerCase() ||
                        (item.phone != null && m.phone === item.phone));
                    return (
                      <Pressable
                        onPress={() => !alreadyAdded && handleAddContact(item)}
                        disabled={alreadyAdded}
                        accessibilityRole="button"
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center',
                          paddingVertical: tokens.spacing.sm,
                          opacity: alreadyAdded ? 0.5 : pressed ? 0.7 : 1,
                        })}
                      >
                        <Avatar
                          initials={getInitials(item.name)}
                          bg={namePalette(item.name).bg}
                          size="sm"
                        />
                        <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                          <Text variant="body">{item.name}</Text>
                          {(item.phone ?? item.email) ? (
                            <Text variant="caption" color={colors.text.secondary}>
                              {item.phone ?? item.email}
                            </Text>
                          ) : null}
                        </View>
                        {alreadyAdded
                          ? <Ionicons name="checkmark-circle" size={20} color={colors.success.default} />
                          : <Ionicons name="add-circle-outline" size={20} color={colors.primary.default} />
                        }
                      </Pressable>
                    );
                  }}
                  ItemSeparatorComponent={() => <Divider />}
                  ListEmptyComponent={
                    <Text
                      variant="caption"
                      color={colors.text.secondary}
                      style={{ textAlign: 'center', paddingVertical: tokens.spacing.md }}
                    >
                      {contactQuery
                        ? t('invite.add_participants.contacts_no_match')
                        : t('invite.add_participants.contacts_empty')}
                    </Text>
                  }
                />
              </View>
            )
          )}

          <ErrorBanner
            error={error}
            fallback={t('groups.create.error_fallback')}
            style={{ marginTop: tokens.spacing.sm }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <PaywallSheet visible={limitReached} onClose={clearLimitReached} onPurchased={clearLimitReached} />
    </ScreenWrapper>
  );
}
