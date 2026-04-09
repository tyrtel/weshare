# WeShare

Cross-platform mobile bill-split application built with Expo (React Native) and TypeScript.

---

## Folder structure

```
weshare/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx               # Root layout — mounts ServiceProvider + SimulationBanner
│   ├── +not-found.tsx
│   └── (tabs)/
│       ├── _layout.tsx           # Tab bar configuration
│       ├── index.tsx             # Bills screen
│       ├── participants.tsx      # Participants screen
│       └── payments.tsx          # Payments screen
│
├── src/
│   ├── core/
│   │   ├── models/               # Pure TypeScript interfaces (Bill, Participant, Split)
│   │   ├── interfaces/           # Service contracts (IStorageService, IPaymentService, …)
│   │   └── di/
│   │       ├── container.ts      # ServiceContainer class + createProductionContainer/createTestContainer
│   │       └── ServiceContext.tsx# React context + useContainer / useService hooks
│   │
│   ├── infrastructure/           # Concrete implementations (depend on native APIs)
│   │   ├── storage/
│   │   │   └── SqliteStorageService.ts   # expo-sqlite implementation of IStorageService
│   │   ├── payments/
│   │   │   ├── VenmoPaymentService.ts    # Venmo deep-link
│   │   │   └── RevolutPaymentService.ts  # Revolut deep-link
│   │   └── notifications/
│   │       └── StubNotificationService.ts
│   │
│   ├── __mocks__/                # In-memory/spy implementations for tests
│   │   ├── InMemoryStorageService.ts
│   │   ├── MockPaymentService.ts
│   │   └── MockNotificationService.ts
│   │
│   ├── features/                 # Feature modules — each is self-contained
│   │   ├── bills/
│   │   │   ├── components/       # BillCard, BillList, CreateBillForm
│   │   │   ├── hooks/            # useBills
│   │   │   └── __tests__/        # bills.test.ts  ← example test (see below)
│   │   ├── participants/
│   │   │   ├── components/       # ParticipantItem, AddParticipantForm
│   │   │   ├── hooks/            # useParticipants
│   │   │   └── __tests__/
│   │   ├── splits/
│   │   │   ├── components/       # SplitItem, SplitCalculator
│   │   │   ├── hooks/            # useSplits
│   │   │   └── __tests__/
│   │   └── payments/
│   │       ├── components/       # PaymentButton
│   │       ├── hooks/            # usePayments
│   │       └── __tests__/
│   │
│   └── shared/
│       └── components/
│           └── SimulationBanner.tsx
│
├── app.config.ts                 # Expo config — reads EXPO_PUBLIC_SIMULATE env var
├── jest.config.js
├── tsconfig.json
└── package.json
```

---

## Running in simulation mode

Simulation mode wires the DI container with in-memory mocks instead of SQLite and real
payment deep-links. No data is written to disk and no payment apps are opened.

```bash
EXPO_PUBLIC_SIMULATE=true npx expo start
```

A yellow banner renders at the top of every screen to make the mode visible at a glance.

---

## Running tests

```bash
npx jest                  # run all tests once
npx jest --watch          # re-run on file change
npx jest --coverage       # generate coverage report
```

Tests live in `src/features/**/__tests__/`. They use `createTestContainer()` to receive
`InMemoryStorageService` and `MockPaymentService`, so they run with no native modules and
no file I/O.

---

## Adding a new service — the 4-step pattern

### 1. Define the interface

Create `src/core/interfaces/IMyService.ts`:

```typescript
export interface IMyService {
  doSomething(input: string): Promise<string>;
}
```

### 2. Write the production implementation

Create `src/infrastructure/my-service/MyServiceImpl.ts`:

```typescript
import type { IMyService } from '../../core/interfaces/IMyService';

export class MyServiceImpl implements IMyService {
  async doSomething(input: string): Promise<string> {
    return `result for ${input}`;
  }
}
```

### 3. Write the mock implementation

Create `src/__mocks__/MockMyService.ts`:

```typescript
import type { IMyService } from '../core/interfaces/IMyService';

export class MockMyService implements IMyService {
  calls: string[] = [];

  async doSomething(input: string): Promise<string> {
    this.calls.push(input);
    return `mock result for ${input}`;
  }
}
```

### 4. Register in the container

Open `src/core/di/container.ts`:

a. Add `'myService': IMyService` to the `ServiceMap` type and `ServiceKey` union.

b. In `createProductionContainer`, import and register:
```typescript
const { MyServiceImpl } = await import('../../infrastructure/my-service/MyServiceImpl');
container.register('myService', new MyServiceImpl());
```

c. In `createTestContainer`, register the mock:
```typescript
const { MockMyService } = require('../../__mocks__/MockMyService');
container.register('myService', new MockMyService());
```

Consume it anywhere with:
```typescript
const myService = useContainer().resolve('myService');
```

---

## Architecture notes

- **No concrete imports in business logic.** Hooks and components only import from
  `src/core/interfaces/` and `src/core/models/`. Infrastructure imports live only in
  `src/infrastructure/` and the DI container factory.
- **Feature-based top-level structure.** Each feature under `src/features/` owns its
  components, hooks, and tests. Cross-feature concerns go in `src/shared/`.
- **Simulation ≠ test.** Simulation mode runs the full Expo app with mocks (useful for
  demos, CI screenshot tests). Jest tests run headless with `createTestContainer()` directly.
