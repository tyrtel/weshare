module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', '<rootDir>/jest.setup.ts'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/worktrees/',
  ],
  modulePathIgnorePatterns: [
    '/.claude/worktrees/',
  ],
  // Allow Jest to transform Expo and React Native packages written as ESM.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-contacts)',
  ],
  moduleNameMapper: {
    '^@sentry/react-native$': '<rootDir>/src/__mocks__/sentryMock.ts',
    '^expo-contacts$': '<rootDir>/src/__mocks__/expo-contacts.ts',
    '^expo-haptics$': '<rootDir>/src/__mocks__/expo-haptics.ts',
    '^expo-localization$': '<rootDir>/src/__mocks__/expo-localization.ts',
    '^expo-secure-store$': '<rootDir>/src/__mocks__/expo-secure-store.ts',
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.ts',
    '^react-native-reanimated$': '<rootDir>/src/__mocks__/reanimatedMock.js',
    '^react-native-gesture-handler$': '<rootDir>/src/__mocks__/gestureHandlerMock.js',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@mocks/(.*)$': '<rootDir>/src/__mocks__/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
};
