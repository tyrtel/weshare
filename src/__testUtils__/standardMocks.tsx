// Reusable mock-module factories for screen tests.
//
// Jest hoists jest.mock() calls above imports, so the jest.mock(...) call itself must
// still live in each test file — this only centralizes the mock *implementation* so
// it isn't copy-pasted across every screen test. Exported names are prefixed `mock`
// so babel-plugin-jest-hoist's allowlist permits referencing them from inside a
// hoisted jest.mock() factory. Usage in a test file:
//
//   jest.mock('expo-router', () => mockExpoRouterModule());
//   jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
//   jest.mock('react-native-safe-area-context', () => mockSafeAreaModule());
//   jest.mock('react-native-svg', () => mockSvgModule());
//
// useLocalSearchParams is exported as a bare jest.fn() (not wrapped) so tests can
// import it post-mock and call .mockReturnValue(...) per test case, same as the
// existing hand-rolled mocks it replaces.

import React, { useEffect } from 'react';
import { View } from 'react-native';

interface StackScreenOptions {
  headerLeft?: () => React.ReactNode;
  headerRight?: () => React.ReactNode;
}

export function mockExpoRouterModule() {
  // A single stable object (not a fresh one per call) so a test can grab it via
  // useRouter() and assert on push/back/replace having been called.
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return {
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    // Approximates "runs on screen focus" as "runs on mount" — enough for hooks
    // like useTripDetail/useExpenseDetail that fetch inside useFocusEffect.
    useFocusEffect: (effect: () => void | (() => void)) => { useEffect(effect, []); },
    Stack: {
      // Several screens put their primary action in the native header via
      // `options={{ headerLeft, headerRight }}` — render those so tests can find
      // and press them, instead of silently dropping the header entirely.
      Screen: ({ options }: { options?: StackScreenOptions }) => (
        <>{options?.headerLeft?.()}{options?.headerRight?.()}</>
      ),
    },
  };
}

export function mockVectorIconsModule() {
  return { Ionicons: () => null, Feather: () => null };
}

export function mockSafeAreaModule() {
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
}

export function mockSvgModule() {
  return { __esModule: true, default: View, Svg: View, Path: View, G: View, Circle: View };
}
