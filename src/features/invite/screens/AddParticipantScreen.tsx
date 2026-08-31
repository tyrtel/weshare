import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Divider } from '../../../components/ui/Divider';
import { HeaderConfirmButton } from '../../../components/ui';
import { AddMemberNameField } from '../../../components/ui/AddMemberNameField';
import { ContactsPickerList } from '../../../components/ui/ContactsPickerList';
import { CurrentMembersList } from '../../../components/ui/CurrentMembersList';
import type { ContactItem } from '../../../components/ui/ContactsPickerList';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { MEMBER_REPO, SHARE, TRIP_STORE } from '../../../core/di/tokens';
import { generateId } from '../../../core/utils/generateId';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { isOk } from '../../../core/types/Result';
import type { TripMember } from '../../../core/models/TripMember';

// ── Frequent people from other trips ──────────────────────────────────────────

interface FrequentPeopleSectionProps {
  currentTripId: string;
  currentMembers: TripMember[];
  onAdded: (member: TripMember) => void;
}

function FrequentPeopleSection({ currentTripId, currentMembers, onAdded }: FrequentPeopleSectionProps) {
  const { t } = useTranslation();
  const colors     = useColors();
  const memberRepo = useService(MEMBER_REPO);
  const store      = useService(TRIP_STORE);
  const allMembers = useTripSessionStore(s => s.members);

  const suggestions = useMemo(() => {
    const currentNames = new Set(currentMembers.map(m => m.displayName.toLowerCase()));
    const freq = new Map<string, { member: TripMember; count: number }>();

    for (const [tid, tripMembers] of Object.entries(allMembers)) {
      if (tid === currentTripId) continue;
      for (const m of tripMembers) {
        const key = m.displayName.toLowerCase();
        if (currentNames.has(key)) continue;
        if (!freq.has(key)) freq.set(key, { member: m, count: 0 });
        freq.get(key)!.count++;
      }
    }

    return [...freq.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(({ member }) => member);
  }, [allMembers, currentTripId, currentMembers]);

  if (suggestions.length === 0) return null;

  const handleQuickAdd = async (suggestion: TripMember) => {
    const member: TripMember = {
      ...suggestion,
      userId:   generateId(),
      tripId:   currentTripId,
      isGuest:  true,
      joinedAt: new Date(),
    };
    const result = await memberRepo.addMember(member);
    if (isOk(result)) {
      store.getState().appendMember(result.value);
      onAdded(result.value);
    }
  };

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
        {t('invite.add_participants.frequent_label')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs }}>
        {suggestions.map(s => (
          <Pressable
            key={s.userId}
            onPress={() => handleQuickAdd(s)}
            accessibilityRole="button"
            accessibilityLabel={t('invite.add_participants.quick_add_label', { name: s.displayName })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: tokens.spacing.sm,
              paddingVertical: 6,
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="caption">{s.displayName}</Text>
            <Ionicons name="add" size={12} color={colors.text.secondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Share invite section ───────────────────────────────────────────────────────

interface ShareInviteSectionProps {
  inviteUrl: string;
  onShare: () => void;
}

function ShareInviteSection({ inviteUrl, onShare }: ShareInviteSectionProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => Clipboard.setString(inviteUrl);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel={t('invite.add_participants.share_invite_label')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: tokens.spacing.xs,
          paddingVertical: tokens.spacing.sm,
          paddingHorizontal: tokens.spacing.md,
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: colors.primary.dim,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="share-social-outline" size={16} color={colors.primary.default} />
        <Text variant="label" color={colors.primary.default}>{t('invite.add_participants.share_invite_label')}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.primary.default}
        />
      </Pressable>

      {expanded && (
        <View style={{
          marginTop: tokens.spacing.sm,
          padding: tokens.spacing.md,
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text
            variant="caption"
            color={colors.primary.light}
            numberOfLines={1}
            style={{ marginBottom: tokens.spacing.sm }}
          >
            {inviteUrl}
          </Text>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <Pressable
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel={t('invite.add_participants.copy_link_label')}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: tokens.spacing.xs,
                paddingVertical: tokens.spacing.sm,
                backgroundColor: colors.surfaceAlt,
                borderRadius: tokens.radius.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="copy-outline" size={16} color={colors.text.secondary} />
              <Text variant="label" color={colors.text.secondary}>{t('invite.add_participants.copy_link')}</Text>
            </Pressable>
            <Pressable
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel={t('invite.add_participants.share_label')}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: tokens.spacing.xs,
                paddingVertical: tokens.spacing.sm,
                backgroundColor: colors.primary.subtle,
                borderRadius: tokens.radius.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="share-outline" size={16} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('common.share')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export function AddParticipantScreen() {
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const colors     = useColors();
  const router     = useRouter();
  const share      = useService(SHARE);
  const memberRepo = useService(MEMBER_REPO);
  const store      = useService(TRIP_STORE);
  const { trip, loading } = useTripDetail(tripId);

  // Local mirror of members so new additions reflect immediately in duplicate checks.
  // Resynced during render (rather than in an effect) whenever `trip` changes.
  const [localMembers, setLocalMembers] = useState<TripMember[]>([]);
  const [prevTrip, setPrevTrip] = useState(trip);
  if (trip !== prevTrip) {
    setPrevTrip(trip);
    if (trip) setLocalMembers(trip.members);
  }

  const handleAdded = useCallback((member: TripMember) => {
    setLocalMembers(prev => [...prev, member]);
  }, []);

  const handleManualAdd = useCallback(async (name: string) => {
    const member: TripMember = {
      userId:      generateId(),
      tripId,
      displayName: name,
      isGuest:     true,
      joinedAt:    new Date(),
    };
    const result = await memberRepo.addMember(member);
    if (!isOk(result)) return false;
    store.getState().appendMember(result.value);
    handleAdded(result.value);
    return true;
  }, [tripId, memberRepo, store, handleAdded]);

  // ── Contacts state ──────────────────────────────────────────────────────────

  const [contactsExpanded,    setContactsExpanded]    = useState(false);
  const [contactsPermission,  setContactsPermission]  = useState<string | null>(null);
  const [contactList,         setContactList]         = useState<ContactItem[]>([]);
  const [contactsLoading,     setContactsLoading]     = useState(false);
  const [contactQuery,        setContactQuery]        = useState('');
  const [addedContactIds,     setAddedContactIds]     = useState<Set<string>>(new Set());
  const [addingContactId,     setAddingContactId]     = useState<string | null>(null);

  const handleToggleContacts = useCallback(async () => {
    const opening = !contactsExpanded;
    setContactsExpanded(opening);

    // Lazy-load: request permission + fetch contacts on first open only.
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
    const member: TripMember = {
      userId:      generateId(),
      tripId,
      displayName: contact.name,
      isGuest:     true,
      joinedAt:    new Date(),
      phone:       contact.phone,
      email:       contact.email,
    };
    const result = await memberRepo.addMember(member);
    setAddingContactId(null);
    if (isOk(result)) {
      store.getState().appendMember(result.value);
      handleAdded(result.value);
      setAddedContactIds(prev => new Set(prev).add(contact.id));
    }
  }, [tripId, memberRepo, store, handleAdded]);

  const inviteUrl = trip?.inviteToken
    ? Linking.createURL(`/join/${trip.inviteToken}`)
    : null;

  if (loading || !trip) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const doneButton = () => (
    <HeaderConfirmButton
      onPress={() => router.replace(`/trip/${tripId}` as Parameters<typeof router.replace>[0])}
      disabled={false}
      loading={false}
      accessibilityLabel={t('invite.add_participants.done_label')}
    />
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('invite.add_participants.title'), headerRight: doneButton }} />
      <ClosedTripGuard trip={trip} message={t('invite.add_participants.closed_guard')}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: tokens.spacing.md,
            paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT,
          }}
          ListHeaderComponent={
            <>
              <Text variant="heading2" style={{ marginBottom: tokens.spacing.xs }}>
                {t('invite.add_participants.heading')}
              </Text>
              <Text
                variant="body"
                color={colors.text.secondary}
                style={{ marginBottom: tokens.spacing.lg }}
              >
                {t('invite.add_participants.subtitle', { trip_name: trip.name })}
              </Text>

              {/* Current members */}
              <CurrentMembersList
                members={localMembers}
                countLabel={t('invite.add_participants.member_count', { count: localMembers.length })}
              />

              {/* Manual name entry */}
              <AddMemberNameField
                existingNames={localMembers.map(m => m.displayName)}
                onAdd={handleManualAdd}
                placeholder={t('invite.add_participants.name_placeholder')}
                addButtonLabel={t('invite.add_participants.add_button')}
                duplicateErrorLabel={t('invite.add_participants.duplicate_error')}
                genericErrorLabel={t('invite.add_participants.add_error')}
                fieldAccessibilityLabel={t('invite.add_participants.name_label')}
                addButtonAccessibilityLabel={t('invite.add_participants.add_button_label')}
              />

              {/* Contacts toggle — lazy loads on first open */}
              <Pressable
                onPress={handleToggleContacts}
                accessibilityRole="button"
                accessibilityLabel={contactsExpanded ? t('invite.add_participants.contacts_hide') : t('invite.add_participants.contacts_toggle')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: tokens.spacing.xs,
                  paddingVertical: tokens.spacing.sm,
                  marginBottom: tokens.spacing.xs,
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
              {/* SEC-10: disclose that contact details are shared with all trip members. */}
              <Text
                variant="caption"
                color={colors.text.tertiary}
                style={{ marginBottom: tokens.spacing.sm }}
              >
                {t('invite.add_participants.privacy_notice')}
              </Text>

              {/* Inline contacts list — only rendered when expanded */}
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
                  alreadyAddedAccessibilityLabel={name => t('invite.add_participants.contact_already_added', { name })}
                  addAccessibilityLabel={name => t('invite.add_participants.contact_add_label', { name })}
                />
              )}

              {/* Quick-add suggestions from other trips */}
              <FrequentPeopleSection
                currentTripId={tripId}
                currentMembers={localMembers}
                onAdded={handleAdded}
              />

              {/* Invite link — expandable share panel */}
              {inviteUrl && (
                <>
                  <Divider style={{ marginBottom: tokens.spacing.lg }} />
                  <ShareInviteSection
                    inviteUrl={inviteUrl}
                    onShare={() => share.shareTrip(trip.id, trip.name, trip.inviteToken ?? '')}
                  />
                </>
              )}
            </>
          }
        />
      </KeyboardAvoidingView>
      </ClosedTripGuard>
    </ScreenWrapper>
  );
}
