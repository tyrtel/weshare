import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useStatusPoller } from '../useStatusPoller';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance fake timers by ms, then flush the microtask queue twice. */
async function tick(ms: number) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('useStatusPoller', () => {
  let appStateListener: ((state: string) => void) | null = null;
  let removeSub: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    appStateListener = null;
    removeSub = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (event: string, cb: (...args: unknown[]) => unknown) => {
        if (event === 'change') appStateListener = cb as (state: string) => void;
        return { remove: removeSub };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls getStatus on each interval tick', async () => {
    const getStatus      = jest.fn().mockResolvedValue('request_sent');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange));

    expect(getStatus).not.toHaveBeenCalled();

    await tick(1000);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('request_sent');

    await tick(1000);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('stops polling when a terminal status (completed) is returned', async () => {
    const getStatus = jest.fn()
      .mockResolvedValueOnce('request_sent')
      .mockResolvedValueOnce('completed');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange));

    await tick(1000);
    expect(onStatusChange).toHaveBeenCalledWith('request_sent');

    await tick(1000);
    expect(onStatusChange).toHaveBeenCalledWith('completed');

    // Further ticks must not fire additional polls.
    await tick(5000);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('stops polling when a terminal status (declined) is returned', async () => {
    const getStatus      = jest.fn().mockResolvedValueOnce('declined');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange));

    await tick(1000);
    expect(onStatusChange).toHaveBeenCalledWith('declined');

    await tick(3000);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('polls immediately when AppState transitions from background to active', async () => {
    const getStatus      = jest.fn().mockResolvedValue('request_sent');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 10_000, onStatusChange));

    expect(getStatus).not.toHaveBeenCalled();

    // Simulate background → active.
    act(() => { appStateListener?.('background'); });
    await act(async () => { appStateListener?.('active'); });
    await Promise.resolve();

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('request_sent');
  });

  it('does not poll on active → active AppState transitions', async () => {
    const getStatus      = jest.fn().mockResolvedValue('request_sent');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 10_000, onStatusChange));

    await act(async () => { appStateListener?.('active'); });
    await Promise.resolve();

    // 'active' → 'active' should not trigger a poll (appStateRef starts as 'active').
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('cleans up the interval and AppState listener on unmount', async () => {
    const getStatus      = jest.fn().mockResolvedValue('pending');
    const onStatusChange = jest.fn();

    const { unmount } = renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange));

    await tick(1000);
    expect(getStatus).toHaveBeenCalledTimes(1);

    unmount();

    await tick(5000);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(removeSub).toHaveBeenCalledTimes(1);
  });

  it('does not set up polling when enabled is false', async () => {
    const getStatus      = jest.fn().mockResolvedValue('request_sent');
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange, false));

    await tick(5000);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('skips onStatusChange when getStatus returns null', async () => {
    const getStatus      = jest.fn().mockResolvedValue(null);
    const onStatusChange = jest.fn();

    renderHook(() => useStatusPoller(getStatus, 1000, onStatusChange));

    await tick(1000);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
