// Release tests: run the real Supabase repositories, hooks and production DI
// container against a local Supabase stack in Docker (`npm run test:release`).
// Kept out of `npm test`, which matches only __tests__ directories.
const path = require('path');
const base = require('./jest.config');
const preset = require('jest-expo/jest-preset');

const [babelJest, babelOptions] = preset.transform['\\.[jt]sx?$'];

module.exports = {
  ...base,
  displayName: 'release',
  testMatch: ['<rootDir>/release/**/*.release.test.ts', '<rootDir>/release/**/*.release.test.tsx'],
  globalSetup: '<rootDir>/release/setup/globalSetup.js',
  setupFiles: ['<rootDir>/release/setup/loadEnv.js'],
  setupFilesAfterEnv: [...base.setupFilesAfterEnv, '<rootDir>/release/setup/afterEnv.js'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^react-native-purchases$': '<rootDir>/release/setup/purchasesStub.js',
  },
  testTimeout: 30_000,
  // Every file shares one database; serial runs keep failures easy to read.
  maxWorkers: 1,
  // supabase-js and the auth service keep timers alive after the last test.
  forceExit: true,
  transform: {
    ...preset.transform,
    '\\.[jt]sx?$': [babelJest, {
      ...babelOptions,
      plugins: [path.join(__dirname, 'release/setup/dynamicImportToRequire.js')],
    }],
  },
};
