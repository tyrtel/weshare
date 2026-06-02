# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server
npx expo start

# Start with simulation mode (in-memory mocks, no SQLite or payment deep-links)
npm run simulate
# or: EXPO_PUBLIC_SIMULATE=true npx expo start

# Simulation mode with live OCR — uses the real Supabase Edge Function (parse-receipt)
# instead of the hardcoded mock. Requires SUPABASE env vars to be set.
npm run simulate:ocr
# or: EXPO_PUBLIC_SIMULATE=true EXPO_PUBLIC_OCR_LIVE=true npx expo start

# Run tests
npm test                   # run all tests once
npm run test:watch         # re-run on file change
npm run test:coverage      # generate coverage report
npx jest src/features/bills/__tests__/bills.test.ts   # run a single test file

# Lint
npm run lint
```

## Architecture

WeShare is an Expo (React Native) + TypeScript bill-split app. The key structural idea is a **DI container** that decouples business logic from infrastructure.

### DI container (`src/core/di/`)

- `container.ts` — `ServiceContainer` class with typed `register`/`resolve`, plus two factory functions:
  - `createProductionContainer()` — async, lazy-imports from `src/infrastructure/`
  - `createTestContainer()` — sync, `require()`s from `src/__mocks__/`
- `ServiceContext.tsx` — React context wrapping the container. `ServiceProvider` (mounted in `app/_layout.tsx`) reads `Constants.expoConfig.extra.simulation` to choose which factory to call. Hooks: `useContainer()`, `useService(key)`.

### Layer rules

- **Hooks and components** only import from `src/core/interfaces/` and `src/core/models/`. No direct infrastructure imports.
- **Infrastructure** (`src/infrastructure/`) holds concrete implementations that depend on native APIs (SQLite, payment deep-links).
- **Mocks** (`src/__mocks__/`) are in-memory/spy implementations used by both Jest tests and simulation mode.
- **Features** (`src/features/`) are self-contained modules (components + hooks + `__tests__/`). Cross-feature concerns go in `src/shared/`.

### Adding a new service (4-step pattern)

1. Define interface in `src/core/interfaces/IMyService.ts`
2. Write production impl in `src/infrastructure/my-service/MyServiceImpl.ts`
3. Write mock impl in `src/__mocks__/MockMyService.ts`
4. Register both in `src/core/di/container.ts`: add key to `ServiceKey` union and `ServiceMap`, register in `createProductionContainer` (dynamic import) and `createTestContainer` (require)

### Testing

Tests live in `src/features/**/__tests__/`. Each test calls `createTestContainer()` in `beforeEach` to get `InMemoryStorageService` and `MockPaymentService` — no native modules, no file I/O.

### Simulation mode vs. tests

Simulation mode runs the full Expo app with mock services (useful for demos). Jest tests run headless via `createTestContainer()` directly. They are distinct paths.
