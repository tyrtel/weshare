import React, { useState } from 'react';
import { View, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { ErrorBanner } from '../../src/components/ui/ErrorBanner';
import { Avatar } from '../../src/components/ui';
import { CurrencyPicker } from '../../src/components/ui/CurrencyPicker';
import { HeaderConfirmButton } from '../../src/components/ui/HeaderConfirmButton';
import { LabeledTextInput } from '../../src/components/ui/LabeledTextInput';
import { Text } from '../../src/components/ui/Text';
import { useEditGroup } from '../../src/features/groups/hooks/useEditGroup';
import { useDeleteGroup } from '../../src/features/groups/hooks/useDeleteGroup';
import { useAddGroupMember } from '../../src/features/groups/hooks/useAddGroupMember';
import { useTripSessionStore } from '../../src/core/di/ServiceContext';
import { confirm } from '../../src/core/utils/confirm';
import { useColors } from '../../src/theme/colors';
import { personColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';

export default function EditGroupScreen() {
  const { t }     = useTranslation();
  const router    = useRouter();
  const colors    = useColors();
  const { id }    = useLocalSearchParams<{ id: string }>();

  const group = useTripSessionStore(s => s.groups.find(g => g.id === id));

  const { editGroup,   loading: editLoading,   error: editError }   = useEditGroup();
  const { deleteGroup, loading: deleteLoading, error: deleteError } = useDeleteGroup();

  const [name,           setName]           = useState(group?.name ?? '');
  const [currency,       setCurrency]       = useState(group?.currency ?? 'EUR');
  const [newMemberName,  setNewMemberName]  = useState('');
  const [addingMember,   setAddingMember]   = useState(false);

  const { addMember, loading: memberLoading, error: memberError } = useAddGroupMember(id ?? '');

  if (!group) return null;

  const handleAddMember = async () => {
    const saved = await addMember({ displayName: newMemberName });
    if (saved) setNewMemberName('');
  };

  const loading  = editLoading || deleteLoading;
  const error    = editError ?? deleteError;
  const isValid  = !loading && !!name.trim();

  const handleSubmit = async () => {
    const updated = await editGroup(group, name, currency);
    if (updated) router.back();
  };

  const handleDelete = () => {
    void confirm(t('groups.detail.delete_title'), t('groups.detail.delete_message'), t('groups.detail.delete_confirm')).then(async confirmed => {
      if (!confirmed) return;
      const ok = await deleteGroup(group.id);
      if (ok) router.replace('/' as Parameters<typeof router.replace>[0]);
    });
  };

  const confirmButton = () => (
    <HeaderConfirmButton
      onPress={handleSubmit}
      disabled={!isValid}
      loading={loading}
      accessibilityLabel={t('groups.edit.confirm_label')}
    />
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('groups.edit.title'), headerRight: confirmButton }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: tokens.spacing.md }} keyboardShouldPersistTaps="handled">
          <LabeledTextInput
            label={t('groups.form.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.form.name_placeholder')}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel={t('groups.form.name_accessibility')}
          />

          <CurrencyPicker
            currency={currency}
            onSelect={setCurrency}
            fieldLabel={t('groups.form.currency_label')}
            selectLabel={t('groups.form.currency_select_label')}
            selectHeading={t('groups.form.currency_select_heading')}
            closeLabel={t('groups.form.currency_close_label')}
          />

          {/* Members section */}
          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
            {t('groups.edit.members_label')}
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.md, marginBottom: tokens.spacing.md, overflow: 'hidden' }}>
            {group.members.map((member, i) => {
              const palette = personColors[i % personColors.length];
              const initials = (() => {
                const parts = member.displayName.trim().split(/\s+/);
                return parts.length >= 2
                  ? (parts[0][0] + parts[1][0]).toUpperCase()
                  : member.displayName.slice(0, 2).toUpperCase();
              })();
              return (
                <View
                  key={member.userId}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                    borderBottomWidth: i < group.members.length - 1 ? 1 : 0,
                    borderBottomColor: colors.borderMuted,
                  }}
                >
                  <Avatar initials={initials} bg={palette.bg} url={member.avatarUrl} size="sm" />
                  <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                    <Text variant="body">{member.displayName}</Text>
                    {member.isGuest && (
                      <Text variant="caption" color={colors.text.tertiary}>{t('groups.edit.guest_label')}</Text>
                    )}
                  </View>
                  {member.userId === group.ownerId && (
                    <Text variant="caption" color={colors.primary.default}>{t('groups.edit.owner_label')}</Text>
                  )}
                </View>
              );
            })}

            {/* Add member row */}
            {addingMember ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, borderTopWidth: group.members.length > 0 ? 1 : 0, borderTopColor: colors.borderMuted }}>
                <TextInput
                  value={newMemberName}
                  onChangeText={setNewMemberName}
                  placeholder={t('groups.edit.member_name_placeholder')}
                  placeholderTextColor={colors.text.tertiary}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddMember}
                  style={{ flex: 1, color: colors.text.primary, fontSize: tokens.fontSize.md, paddingVertical: tokens.spacing.xs }}
                />
                <Pressable
                  onPress={handleAddMember}
                  disabled={!newMemberName.trim() || memberLoading}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ marginLeft: tokens.spacing.sm, opacity: pressed ? 0.6 : 1 })}
                >
                  {memberLoading
                    ? <ActivityIndicator size="small" color={colors.primary.default} />
                    : <Ionicons name="checkmark-circle" size={24} color={newMemberName.trim() ? colors.primary.default : colors.text.tertiary} />}
                </Pressable>
                <Pressable
                  onPress={() => { setAddingMember(false); setNewMemberName(''); }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ marginLeft: tokens.spacing.xs, opacity: pressed ? 0.6 : 1 })}
                >
                  <Ionicons name="close-circle-outline" size={22} color={colors.text.tertiary} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setAddingMember(true)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                  borderTopWidth: group.members.length > 0 ? 1 : 0, borderTopColor: colors.borderMuted,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.primary.default} />
                <Text variant="body" color={colors.primary.default} style={{ marginLeft: tokens.spacing.sm }}>
                  {t('groups.edit.add_member_button')}
                </Text>
              </Pressable>
            )}
          </View>

          <ErrorBanner error={memberError} fallback={t('groups.edit.add_member_error')} style={{ marginBottom: tokens.spacing.sm }} />

          <ErrorBanner error={error} fallback={t('groups.edit.error_fallback')} style={{ marginBottom: tokens.spacing.md }} />

          <Pressable
            onPress={handleDelete}
            disabled={deleteLoading}
            accessibilityRole="button"
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: tokens.spacing.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="label" color={colors.error.default}>{t('groups.detail.delete_confirm')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
