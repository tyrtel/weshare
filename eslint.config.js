const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // ── Global ignores ──────────────────────────────────────────────────────────
  { ignores: ['coverage/**'] },

  // ── TypeScript ───────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // ── React (flat config API — compatible with ESLint 9/10) ───────────────────
  {
    ...reactPlugin.configs.flat.recommended,
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
    },
    settings: {
      react: { version: '18.3.1' },
    },
  },

  // ── React Hooks ──────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooksPlugin },
    rules: reactHooksPlugin.configs['recommended-latest'].rules,
  },

  // ── Layer boundary rules ─────────────────────────────────────────────────────
  // Enforces the architecture documented in CLAUDE.md:
  //   • Features and hooks may only import from src/core/ — never directly from
  //     src/infrastructure/ (use the DI container instead).
  //   • Core logic (models, interfaces, types, utils, logic, schemas) may not
  //     import from infrastructure, features, or components. The di/ sub-layer
  //     is exempt because it explicitly wires the two sides together.
  //   • Mocks may only import from core/ — not from infrastructure or features.

  {
    files: [
      'src/features/**/*.ts',
      'src/features/**/*.tsx',
      'src/hooks/**/*.ts',
      'src/hooks/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group:   ['**/infrastructure/**'],
          message: 'Features and hooks may not import from infrastructure. Resolve services via the DI container (useService).',
        }],
      }],
    },
  },

  {
    files: ['src/core/**/*.ts', 'src/core/**/*.tsx'],
    ignores: ['src/core/di/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/infrastructure/**'], message: 'Core layer may not import from infrastructure.' },
          { group: ['**/features/**'],       message: 'Core layer may not import from features.' },
          { group: ['**/components/**'],     message: 'Core layer may not import from components.' },
        ],
      }],
    },
  },

  {
    files: ['src/__mocks__/**/*.ts', 'src/__mocks__/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/infrastructure/**'], message: 'Mocks may not import from infrastructure.' },
          { group: ['**/features/**'],       message: 'Mocks may not import from features.' },
        ],
      }],
    },
  },

  // ── Test files + test infrastructure ────────────────────────────────────────
  // Jest test files and testContainer.ts legitimately use require() for:
  //   • jest.mock() factory callbacks (must be require(), not import)
  //   • testContainer.ts lazy-requires to avoid native-module imports at module load
  // Test files also need to import infrastructure directly (e.g. to seed repos,
  // verify behaviour of concrete impls) — boundary rules don't apply.

  {
    files: [
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      'src/core/di/testContainer.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-imports': 'off',
    },
  },

  prettierConfig,
];
