import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ServiceContext } from '../../core/di/ServiceContext';
import { createTestContainer } from '../../core/di/testContainer';
import { TRIP_STORE } from '../../core/di/tokens';
import { WriteErrorBanner } from '../components/WriteErrorBanner';
import type { ServiceContainer } from '../../core/di/ServiceContainer';

function renderBanner(container: ServiceContainer) {
  return render(
    <ServiceContext.Provider value={container}>
      <WriteErrorBanner />
    </ServiceContext.Provider>,
  );
}

describe('WriteErrorBanner', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('renders nothing while there is no write error', () => {
    renderBanner(createTestContainer());
    expect(screen.queryByTestId('write-error-banner')).toBeNull();
  });

  it('shows when a save-first write fails, and dismisses on tap', () => {
    const container = createTestContainer();
    renderBanner(container);

    act(() => { container.resolve(TRIP_STORE).setState({ writeError: { kind: 'NetworkError', message: 'down' } }); });
    expect(screen.getByTestId('write-error-banner')).toBeTruthy();

    fireEvent.press(screen.getByTestId('write-error-banner'));
    expect(screen.queryByTestId('write-error-banner')).toBeNull();
  });

  it('dismisses itself after a few seconds', () => {
    jest.useFakeTimers();
    const container = createTestContainer();
    renderBanner(container);

    act(() => { container.resolve(TRIP_STORE).setState({ writeError: { kind: 'NetworkError', message: 'down' } }); });
    act(() => { jest.advanceTimersByTime(6000); });

    expect(screen.queryByTestId('write-error-banner')).toBeNull();
  });
});
