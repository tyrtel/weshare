import { act } from '@testing-library/react-native';
import { useThemeStore } from '../themeStore';

describe('useThemeStore', () => {
  beforeEach(() => {
    act(() => {
      useThemeStore.setState({ preference: 'system' });
    });
  });

  it('defaults to system preference', () => {
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('setPreference updates state to light', () => {
    act(() => {
      useThemeStore.getState().setPreference('light');
    });
    expect(useThemeStore.getState().preference).toBe('light');
  });

  it('setPreference updates state to dark', () => {
    act(() => {
      useThemeStore.getState().setPreference('dark');
    });
    expect(useThemeStore.getState().preference).toBe('dark');
  });

  it('setPreference can switch back to system', () => {
    act(() => {
      useThemeStore.getState().setPreference('dark');
      useThemeStore.getState().setPreference('system');
    });
    expect(useThemeStore.getState().preference).toBe('system');
  });
});
