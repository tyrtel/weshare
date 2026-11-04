import { waitFor } from '@testing-library/react-native';
import { useCreateTrip } from '../../src/features/trips/hooks/useCreateTrip';
import { useJoinTrip } from '../../src/features/invite/hooks/useJoinTrip';
import { useCreateGroup } from '../../src/features/groups/hooks/useCreateGroup';
import { useJoinGroup } from '../../src/features/groups/hooks/useJoinGroup';
import { AUTH, GROUP_REPO, MEMBER_REPO, TRIP_REPO } from '../../src/core/di/tokens';
import { supabase } from '../../src/infrastructure/supabase/supabaseClient';
import type { Group } from '../../src/core/models/Group';
import type { Trip } from '../../src/core/models/Trip';
import { admin, closeClient, container, createUser, renderAppHook, run, signInAs, TestUser } from '../support';

// Same alphabet as generate_invite_token() (002/010): no 0/O, 1/I/l.
const TOKEN_SHAPE = /^[A-HJ-NP-Za-km-z2-9]{8}$/;

async function joinTrip(user: TestUser, token: string) {
  await signInAs(user);
  const { result } = await renderAppHook(() => useJoinTrip(token));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  await run(() => result.current.joinAuthenticated());
  expect(result.current.joinError).toBeNull();
}

async function joinGroup(user: TestUser, token: string) {
  await signInAs(user);
  const { result } = await renderAppHook(() => useJoinGroup(token));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  await run(() => result.current.joinAuthenticated());
  expect(result.current.joinError).toBeNull();
}

async function tripMemberIds(tripId: string): Promise<string[]> {
  const { data } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId);
  return data!.map(r => r.user_id).sort();
}

async function groupMemberIds(groupId: string): Promise<string[]> {
  const { data } = await admin.from('group_members').select('user_id').eq('group_id', groupId);
  return data!.map(r => r.user_id).sort();
}

describe('trip invite links', () => {
  let host: TestUser;
  let joiner: TestUser;
  let outsider: TestUser;
  let trip: Trip;

  beforeAll(async () => {
    joiner = await createUser('Joiner');
    outsider = await createUser('Outsider');
    host = await createUser('Host');
    const { result } = await renderAppHook(() => useCreateTrip());
    trip = (await run(() => result.current.createTrip('Porto', 'EUR')))!;
  });

  afterAll(closeClient);

  it('the database generates the token, not the app', async () => {
    const { data } = await admin.from('trips').select('invite_token').eq('id', trip.id).single();
    expect(data!.invite_token).toMatch(TOKEN_SHAPE);
    expect(trip.inviteToken).toBe(data!.invite_token);
  });

  it('a signed-out user can preview the trip name, and nothing else', async () => {
    const c = await container();
    await c.resolve(AUTH).signOut();
    const result = await c.resolve(TRIP_REPO).getTripInvitePreview(trip.inviteToken!);
    expect(result).toEqual({ ok: true, value: { id: trip.id, name: 'Porto', expired: false } });
  });

  it('a non-member still cannot read the trip row by its token', async () => {
    await signInAs(outsider);
    const { data } = await supabase.from('trips').select('id').eq('invite_token', trip.inviteToken!);
    expect(data).toEqual([]);
  });

  it('a non-member cannot add themselves by trip id without the token', async () => {
    await signInAs(outsider);
    const added = await (await container()).resolve(MEMBER_REPO).addMember({
      userId: outsider.id, tripId: trip.id, displayName: outsider.name, isGuest: false, joinedAt: new Date(),
    });
    expect(added.ok).toBe(false);
    expect(await tripMemberIds(trip.id)).toEqual([host.id]);
  });

  it('a signed-out caller cannot join', async () => {
    await (await container()).resolve(AUTH).signOut();
    const { error } = await supabase.rpc('join_trip_by_invite', { p_token: trip.inviteToken!, p_display_name: 'Anon', p_avatar_url: null });
    expect(error).not.toBeNull();
    expect(await tripMemberIds(trip.id)).toEqual([host.id]);
  });

  it('an unknown token shows the invalid-invite state', async () => {
    await signInAs(outsider);
    const { result } = await renderAppHook(() => useJoinTrip('Nope2345'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.kind).toBe('NotFoundError');
  });

  it('a signed-in user joins with the token alone, and joining again changes nothing', async () => {
    await joinTrip(joiner, trip.inviteToken!);
    await joinTrip(joiner, trip.inviteToken!);
    expect(await tripMemberIds(trip.id)).toEqual([host.id, joiner.id].sort());

    const read = await (await container()).resolve(TRIP_REPO).getTrip(trip.id);
    expect(read.ok).toBe(true);
  });

  it('joining claims a placeholder member that has the same email', async () => {
    const claimer = await createUser('Claimer');
    // Added after sign-in, so the sign-in guest merge hasn't already claimed it.
    const placeholderId = `guest_${claimer.id.slice(0, 8)}`;
    await admin.from('trip_members').insert({
      trip_id: trip.id, user_id: placeholderId, display_name: 'Claimer (guest)', is_guest: true, email: claimer.email.toUpperCase(),
    });

    const { result } = await renderAppHook(() => useJoinTrip(trip.inviteToken!));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await run(() => result.current.joinAuthenticated());
    expect(result.current.joinError).toBeNull();

    const { data } = await admin.from('trip_members').select('user_id, display_name, is_guest').eq('trip_id', trip.id).eq('user_id', claimer.id).single();
    expect(data).toEqual({ user_id: claimer.id, display_name: 'Claimer', is_guest: false });
    expect(await tripMemberIds(trip.id)).not.toContain(placeholderId);
  });
});

describe('group invite links', () => {
  let host: TestUser;
  let joiner: TestUser;
  let outsider: TestUser;
  let group: Group;

  beforeAll(async () => {
    joiner = await createUser('Joiner');
    outsider = await createUser('Outsider');
    host = await createUser('Host');
    const { result } = await renderAppHook(() => useCreateGroup());
    group = (await run(() => result.current.createGroup('Club', 'EUR')))!;
  });

  afterAll(closeClient);

  it('the database generates a URL-safe token, not the app', async () => {
    const { data } = await admin.from('groups').select('invite_token').eq('id', group.id).single();
    expect(data!.invite_token).toMatch(TOKEN_SHAPE);
    expect(group.inviteToken).toBe(data!.invite_token);
  });

  it('a signed-out user can preview the group name', async () => {
    const c = await container();
    await c.resolve(AUTH).signOut();
    const result = await c.resolve(GROUP_REPO).getGroupInvitePreview(group.inviteToken!);
    expect(result).toEqual({ ok: true, value: { id: group.id, name: 'Club', expired: false } });
  });

  it('a non-member cannot add themselves by group id without the token', async () => {
    await signInAs(outsider);
    const added = await (await container()).resolve(GROUP_REPO).addMember({
      userId: outsider.id, groupId: group.id, displayName: outsider.name, isGuest: false, joinedAt: new Date(),
    });
    expect(added.ok).toBe(false);
    expect(await groupMemberIds(group.id)).toEqual([host.id]);
  });

  it('a signed-in user joins with the token alone, and joining again changes nothing', async () => {
    await joinGroup(joiner, group.inviteToken!);
    await joinGroup(joiner, group.inviteToken!);
    expect(await groupMemberIds(group.id)).toEqual([host.id, joiner.id].sort());
  });

  it('joining claims a placeholder member that has the same email', async () => {
    const claimer = await createUser('Claimer');
    const placeholderId = `guest_${claimer.id.slice(0, 8)}`;
    await admin.from('group_members').insert({
      group_id: group.id, user_id: placeholderId, display_name: 'Claimer (guest)', is_guest: true, email: claimer.email,
    });

    const { result } = await renderAppHook(() => useJoinGroup(group.inviteToken!));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await run(() => result.current.joinAuthenticated());
    expect(result.current.joinError).toBeNull();

    const ids = await groupMemberIds(group.id);
    expect(ids).toContain(claimer.id);
    expect(ids).not.toContain(placeholderId);
  });
});

const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

describe('trip invite link expiry', () => {
  let host: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let trip: Trip;

  async function previewAs(user: TestUser, token: string) {
    await signInAs(user);
    return (await container()).resolve(TRIP_REPO).getTripInvitePreview(token);
  }

  async function joinAs(user: TestUser, token: string) {
    await signInAs(user);
    const { result } = await renderAppHook(() => useJoinTrip(token));
    await waitFor(() => expect(result.current.loading).toBe(false));
    if (!result.current.trip?.expired) await run(() => result.current.joinAuthenticated());
    return result.current;
  }

  beforeAll(async () => {
    member = await createUser('Member');
    outsider = await createUser('Outsider');
    host = await createUser('Host');
    const { result } = await renderAppHook(() => useCreateTrip());
    trip = (await run(() => result.current.createTrip('Seville', 'EUR')))!;
    await joinTrip(member, trip.inviteToken!);
  });

  afterAll(closeClient);

  it('a new trip link lasts 7 days', () => {
    expect(trip.inviteTtlHours).toBe(168);
    expect(trip.inviteCreatedAt).toBeInstanceOf(Date);
  });

  it('the owner changes the lifetime; a member cannot', async () => {
    await signInAs(host);
    const byOwner = await (await container()).resolve(TRIP_REPO).setInviteTtl(trip.id, 24);
    expect(byOwner.ok && byOwner.value.inviteTtlHours).toBe(24);

    await signInAs(member);
    const byMember = await (await container()).resolve(TRIP_REPO).setInviteTtl(trip.id, null);
    expect(byMember.ok).toBe(false);
    const { data } = await admin.from('trips').select('invite_ttl_hours').eq('id', trip.id).single();
    expect(data!.invite_ttl_hours).toBe(24);
  });

  it('past its lifetime, a newcomer sees it as expired and the database refuses the join', async () => {
    await admin.from('trips').update({ invite_created_at: hoursAgo(25) }).eq('id', trip.id);

    const preview = await previewAs(outsider, trip.inviteToken!);
    expect(preview.ok && preview.value.expired).toBe(true);

    const { error } = await supabase.rpc('join_trip_by_invite', { p_token: trip.inviteToken!, p_display_name: 'Outsider', p_avatar_url: null });
    expect(error?.code).toBe('WS410');
    expect(await tripMemberIds(trip.id)).not.toContain(outsider.id);
  });

  it('an existing member can still open an expired link', async () => {
    const state = await joinAs(member, trip.inviteToken!);
    expect(state.trip?.expired).toBe(false);
    expect(state.joinError).toBeNull();
  });

  it('someone invited as a guest by email can still join through an expired link', async () => {
    const guest = await createUser('Guest');
    await admin.from('trip_members').insert({
      trip_id: trip.id, user_id: `guest_${guest.id.slice(0, 8)}`, display_name: 'Guest', is_guest: true, email: guest.email,
    });

    const { result } = await renderAppHook(() => useJoinTrip(trip.inviteToken!));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.trip?.expired).toBe(false);
    await run(() => result.current.joinAuthenticated());
    expect(result.current.joinError).toBeNull();
    expect(await tripMemberIds(trip.id)).toContain(guest.id);
  });

  it('a member cannot reset the link', async () => {
    await signInAs(member);
    const reset = await (await container()).resolve(TRIP_REPO).resetInvite(trip.id);
    expect(reset.ok).toBe(false);
  });

  it('resetting issues a working new link and kills the old one', async () => {
    const old = trip.inviteToken!;
    await signInAs(host);
    const reset = await (await container()).resolve(TRIP_REPO).resetInvite(trip.id);
    if (!reset.ok) throw new Error('reset failed');
    trip = reset.value;
    expect(trip.inviteToken).not.toBe(old);
    expect(trip.inviteToken).toMatch(TOKEN_SHAPE);

    const oldPreview = await previewAs(outsider, old);
    expect(!oldPreview.ok && oldPreview.error.kind).toBe('NotFoundError');
    const newPreview = await previewAs(outsider, trip.inviteToken!);
    expect(newPreview.ok && newPreview.value.expired).toBe(false);
  });

  it('closing the trip stops the link working', async () => {
    await admin.from('trips').update({ status: 'closed' }).eq('id', trip.id);

    const state = await joinAs(outsider, trip.inviteToken!);
    expect(state.trip?.expired).toBe(true);
    const { error } = await supabase.rpc('join_trip_by_invite', { p_token: trip.inviteToken!, p_display_name: 'Outsider', p_avatar_url: null });
    expect(error?.code).toBe('WS410');
    expect(await tripMemberIds(trip.id)).not.toContain(outsider.id);
  });
});

describe('group invite link expiry', () => {
  let host: TestUser;
  let outsider: TestUser;
  let group: Group;

  beforeAll(async () => {
    outsider = await createUser('Outsider');
    host = await createUser('Host');
    const { result } = await renderAppHook(() => useCreateGroup());
    group = (await run(() => result.current.createGroup('Book club', 'EUR')))!;
  });

  afterAll(closeClient);

  it('a new group link never expires', () => {
    expect(group.inviteTtlHours).toBeNull();
  });

  it('an expired group link is refused, and the owner resetting it opens it again', async () => {
    await signInAs(host);
    const repo = (await container()).resolve(GROUP_REPO);
    expect((await repo.setInviteTtl(group.id, 24)).ok).toBe(true);
    await admin.from('groups').update({ invite_created_at: hoursAgo(25) }).eq('id', group.id);

    await signInAs(outsider);
    const expired = await repo.getGroupInvitePreview(group.inviteToken!);
    expect(expired.ok && expired.value.expired).toBe(true);
    const refused = await repo.joinGroupByInvite(group.inviteToken!, { id: outsider.id, name: outsider.name, createdAt: new Date() });
    expect(!refused.ok && refused.error.kind).toBe('ValidationError');
    expect((await repo.resetInvite(group.id)).ok).toBe(false);

    await signInAs(host);
    const reset = await repo.resetInvite(group.id);
    if (!reset.ok) throw new Error('reset failed');

    await joinGroup(outsider, reset.value.inviteToken!);
    expect(await groupMemberIds(group.id)).toContain(outsider.id);
  });
});
