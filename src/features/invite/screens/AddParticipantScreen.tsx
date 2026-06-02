import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Divider } from '../../../components/ui/Divider';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { MEMBER_REPO, SHARE, TRIP_STORE } from '../../../core/di/tokens';
import { generateId } from '../../../core/utils/generateId';
import { useColors, personColors, personColorFor } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { isOk } from '../../../core/types/Result';
import type { TripMember } from '../../../core/models/TripMember';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Name-hash palette for contacts (not trip members — no stable index available).
function contactPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return personColors[hash % personColors.length];
}

function isAlreadyAdded(name: string, phone: string | undefined, members: TripMember[]): boolean {
  return members.some(
    m => m.displayName === name || (phone != null && m.phone === phone),
  );
}

// ── Section A: Manual add ──────────────────────────────────────────────────────

interface ManualAddSectionProps {
  tripId: string;
  members: TripMember[];
  onAdded: (member: TripMember) => void;
}

function ManualAddSection({ tripId, members, onAdded }: ManualAddSectionProps) {
  const colors     = useColors();
  const memberRepo = useService(MEMBER_REPO);
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
    const member: TripMember = {
      userId:      generateId(),
      tripId,
      displayName: trimmed,
      isGuest:     true,
      joinedAt:    new Date(),
    };
    const result = await memberRepo.addMember(member);
    setSaving(false);
    if (isOk(result)) {
      store.getState().appendMember(result.value);
      onAdded(result.value);
      setName('');
    } else {
      setError('Could not add participant. Please try again.');
    }
  }, [name, tripId, memberRepo, store, onAdded]);

  return (
    <View style={{ marginBottom: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput
          value={name}
          onChangeText={text => { setName(text); setError(null); }}
          placeholder="Enter a name"
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
          accessibilityLabel="Participant name"
        />
        <Pressable
          onPress={handleAdd}
          disabled={!name.trim() || saving || isDuplicate}
          accessibilityRole="button"
          accessibilityLabel="Add participant"
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
            : <Text variant="label" color="#ffffff">Add</Text>}
        </Pressable>
      </View>
      {isDuplicate && (
        <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
          Already in this trip
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

// ── Contacts inline content ────────────────────────────────────────────────────

interface ContactsInlineContentProps {
  permission: string;
  contacts: ContactItem[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  members: TripMember[];
  addedIds: Set<string>;
  addingId: string | null;
  onAddContact: (contact: ContactItem) => void;
}

function ContactsInlineContent({
  permission,
  contacts,
  loading,
  query,
  onQueryChange,
  members,
  addedIds,
  addingId,
  onAddContact,
}: ContactsInlineContentProps) {
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
      <View style={{
        padding: tokens.spacing.md,
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.md,
        marginBottom: tokens.spacing.md,
      }}>
        <Text variant="body" color={colors.text.secondary}>
          Enable contacts in Settings to add from your address book.
        </Text>
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
        placeholder="Search contacts"
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
        accessibilityLabel="Search contacts"
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const alreadyAdded = addedIds.has(item.id) || isAlreadyAdded(item.name, item.phone, members);
          const isAdding     = addingId === item.id;
          const subtitle     = item.phone ?? item.email ?? '';

          return (
            <Pressable
              onPress={() => !alreadyAdded && onAddContact(item)}
              disabled={alreadyAdded || isAdding}
              accessibilityRole="button"
              accessibilityLabel={alreadyAdded ? `${item.name} already added` : `Add ${item.name}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: tokens.spacing.sm,
                opacity: alreadyAdded ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <Avatar
                initials={getInitials(item.name)}
                bg={contactPalette(item.name).bg}
                color={contactPalette(item.name).text}
                size="sm"
              />
              <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                <Text variant="body">{item.name}</Text>
                {subtitle ? (
                  <Text variant="caption" color={colors.text.secondary}>{subtitle}</Text>
                ) : null}
              </View>
              {isAdding ? (
                <ActivityIndicator size="small" color={colors.primary.default} />
              ) : alreadyAdded ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.success?.default ?? '#22c55e'} />
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
            {query ? 'No contacts match your search.' : 'No contacts found.'}
          </Text>
        }
      />
    </View>
  );
}

// ── Frequent people from other trips ──────────────────────────────────────────

interface FrequentPeopleSectionProps {
  currentTripId: string;
  currentMembers: TripMember[];
  onAdded: (member: TripMember) => void;
}

function FrequentPeopleSection({ currentTripId, currentMembers, onAdded }: FrequentPeopleSectionProps) {
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
        Also on your other trips
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs }}>
        {suggestions.map(s => (
          <Pressable
            key={s.userId}
            onPress={() => handleQuickAdd(s)}
            accessibilityRole="button"
            accessibilityLabel={`Quick add ${s.displayName}`}
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
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => Clipboard.setString(inviteUrl);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel="Share invite"
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
        <Text variant="label" color={colors.primary.default}>Share invite</Text>
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
              accessibilityLabel="Copy invite link"
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
              <Text variant="label" color={colors.text.secondary}>Copy link</Text>
            </Pressable>
            <Pressable
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Open share sheet"
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
              <Text variant="label" color={colors.primary.default}>Share</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Current members list ──────────────────────────────────────────────────────

interface CurrentMembersSectionProps {
  members: TripMember[];
}

function CurrentMembersSection({ members }: CurrentMembersSectionProps) {
  const colors = useColors();
  if (members.length === 0) return null;

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.sm }}
      >
        {members.length} {members.length === 1 ? 'person' : 'people'} on this trip
      </Text>
      {members.map((member, i) => {
        const palette = personColorFor(member.userId, members);
        return (
          <View
            key={member.userId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: tokens.spacing.sm,
            }}
          >
            <Avatar
              initials={getInitials(member.displayName)}
              bg={palette.bg}
              color={palette.text}
              size="sm"
            />
            <Text
              variant="body"
              color={colors.text.primary}
              style={{ marginLeft: tokens.spacing.sm }}
            >
              {member.displayName}
            </Text>
          </View>
        );
      })}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: tokens.spacing.xs }} />
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export function AddParticipantScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const colors     = useColors();
  const share      = useService(SHARE);
  const memberRepo = useService(MEMBER_REPO);
  const store      = useService(TRIP_STORE);
  const { trip, loading } = useTripDetail(tripId);

  // Local mirror of members so new additions reflect immediately in duplicate checks.
  const [localMembers, setLocalMembers] = useState<TripMember[]>([]);
  useEffect(() => {
    if (trip) setLocalMembers(trip.members);
  }, [trip]);

  const handleAdded = useCallback((member: TripMember) => {
    setLocalMembers(prev => [...prev, member]);
  }, []);

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

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Add Participants' }} />
      <ClosedTripGuard trip={trip} message="This trip is closed. No new participants can be added.">
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
                Add Participants
              </Text>
              <Text
                variant="body"
                color={colors.text.secondary}
                style={{ marginBottom: tokens.spacing.lg }}
              >
                Add people to {trip.name}.
              </Text>

              {/* Current members */}
              <CurrentMembersSection members={localMembers} />

              {/* Manual name entry */}
              <ManualAddSection
                tripId={tripId}
                members={localMembers}
                onAdded={handleAdded}
              />

              {/* Contacts toggle — lazy loads on first open */}
              <Pressable
                onPress={handleToggleContacts}
                accessibilityRole="button"
                accessibilityLabel={contactsExpanded ? 'Hide contacts' : 'Add from contacts'}
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
                  Add from contacts
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
                Phone and email are visible to all members of this trip.
              </Text>

              {/* Inline contacts list — only rendered when expanded */}
              {contactsExpanded && (
                <ContactsInlineContent
                  permission={contactsPermission ?? ''}
                  contacts={contactList}
                  loading={contactsLoading}
                  query={contactQuery}
                  onQueryChange={setContactQuery}
                  members={localMembers}
                  addedIds={addedContactIds}
                  addingId={addingContactId}
                  onAddContact={handleAddContact}
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
                    onShare={() => share.shareTrip(trip.id, trip.name)}
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
