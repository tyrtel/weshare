import { inviteExpiresAt, inviteLinkStatus, timeRemaining } from '../inviteLink';

const created = new Date('2026-11-01T12:00:00Z');
const hours = (h: number) => new Date(created.getTime() + h * 3_600_000);

describe('inviteExpiresAt', () => {
  it('adds the lifetime to the creation time', () => {
    expect(inviteExpiresAt(created, 24)).toEqual(hours(24));
  });

  it('is null for a link that never expires, or with no creation time', () => {
    expect(inviteExpiresAt(created, null)).toBeNull();
    expect(inviteExpiresAt(undefined, 24)).toBeNull();
  });
});

describe('inviteLinkStatus', () => {
  it('is open before the expiry and expired from the expiry on', () => {
    expect(inviteLinkStatus(created, 24, hours(23))).toEqual({ kind: 'expires', at: hours(24) });
    expect(inviteLinkStatus(created, 24, hours(24))).toEqual({ kind: 'expired' });
  });

  it('never expires without a lifetime', () => {
    expect(inviteLinkStatus(created, null, hours(10_000))).toEqual({ kind: 'never' });
  });

  it('is closed for a closed trip, whatever the lifetime', () => {
    expect(inviteLinkStatus(created, null, hours(1), true)).toEqual({ kind: 'closed' });
  });
});

describe('timeRemaining', () => {
  it('uses days from two days out, then hours, then minutes', () => {
    expect(timeRemaining(hours(72), created)).toEqual({ unit: 'days', count: 3 });
    expect(timeRemaining(hours(47), created)).toEqual({ unit: 'hours', count: 47 });
    expect(timeRemaining(hours(0.5), created)).toEqual({ unit: 'minutes', count: 30 });
  });

  it('never shows less than one minute', () => {
    expect(timeRemaining(created, created)).toEqual({ unit: 'minutes', count: 1 });
  });
});
