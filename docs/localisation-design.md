# Localisation Design

## Goal

Every user-facing display string is looked up from a translation dictionary keyed by locale. The device system language is used by default. A future settings screen will let the user override this — the design is structured to support that without rework.

---

## Library stack

| Library | Role |
|---|---|
| `expo-localization` | Reads the device locale list (`getLocales()`) at startup |
| `i18next` | Core i18n engine — key lookup, interpolation, plurals, fallback |
| `react-i18next` | React bindings — the `useTranslation()` hook and `Trans` component |

**Why i18next over alternatives:**
- `@formatjs/react-intl` — heavier, ICU-format strings are harder to read/write for translators
- `lingui` — compile-time transforms are powerful but add build complexity; the Expo/Metro pipeline already has enough moving parts
- i18next is synchronous when translations are bundled (no async loading, no flash), has first-class TypeScript support, and the `useTranslation` hook is already the mental model most React Native devs know

No network fetching of translations — all locale files are bundled inside the app.

---

## File structure

```
src/i18n/
  index.ts               — i18next init; exports the i18n instance
  locales/
    en.json              — English (source of truth)
    fr.json              — French
  types.d.ts             — TypeScript augmentation for type-safe keys
```

A single JSON file per language (rather than per-namespace files) keeps the full string inventory visible in one place, which makes auditing and handing off to a translator straightforward. Keys are namespaced with dots inside the file.

---

## Key naming convention

Keys follow the pattern `feature.screen_or_component.element`, all lowercase with underscores for multi-word segments:

```json
{
  "common.save":                    "Save",
  "common.cancel":                  "Cancel",
  "common.delete":                  "Delete",
  "common.loading":                 "Loading...",
  "common.error.generic":           "Something went wrong",
  "common.retry":                   "Try again",

  "auth.welcome.title":             "Welcome to ouiShare",
  "auth.welcome.subtitle":          "Split trips, not friendships",
  "auth.sign_in.google":            "Continue with Google",
  "auth.sign_in.guest":             "Continue as Guest",

  "trips.list.empty.title":         "No trips yet",
  "trips.list.empty.body":          "Create your first trip to get started",
  "trips.detail.members_count":     "{{count}} member",
  "trips.detail.members_count_other": "{{count}} members",
  "trips.create.title":             "New Trip",
  "trips.create.name.label":        "Trip name",

  "expenses.form.title.add":        "Add Expense",
  "expenses.form.title.edit":       "Edit Expense",
  "expenses.form.description.label": "Description",
  "expenses.form.amount.label":     "Amount",
  "expenses.form.paid_by.label":    "Paid by",

  "settlement.title":               "Settle Up",
  "settlement.paid":                "Paid",
  "settlement.owes":                "{{from}} owes {{to}} {{amount}}",

  "balance.title":                  "Balance"
}
```

**Rules:**
- Keys are always present in `en.json`; a missing key in `fr.json` falls back to English automatically
- Dynamic values use `{{name}}` interpolation — never concatenate translated strings with JS template literals
- Plurals use i18next's built-in convention: `key` for singular, `key_other` for plural (and `key_zero`, `key_one`, etc. as needed per locale)
- Do **not** translate: Sentry messages, `console.log`, error codes, internal constants, accessibility role strings

---

## TypeScript type safety

`i18next` supports type augmentation so `t('bad.key')` is a compile-time error.

`src/i18n/types.d.ts`:
```typescript
import en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
```

With this in place, `t()` autocompletes and rejects unknown keys. The English JSON is the type source of truth — adding a key to `en.json` immediately makes it available to TypeScript; removing one becomes a compile error anywhere it was used.

---

## Initialisation

`src/i18n/index.ts` initialises i18next synchronously (translations are bundled, no async loading needed):

```typescript
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import fr from './locales/fr.json';

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';

i18next
  .use(initReactI18next)
  .init({
    lng:             deviceLocale,
    fallbackLng:     'en',
    resources:       { en: { translation: en }, fr: { translation: fr } },
    interpolation:   { escapeValue: false }, // React already escapes
    compatibilityJSON: 'v4',
  });

export default i18next;
```

This is imported once at the top of `app/_layout.tsx` (a side-effect import: `import '../src/i18n';`). Because `init` is synchronous and runs before any component renders, there is no flash of untranslated content.

---

## Usage in components

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <Text>{t('trips.create.title')}</Text>;
}
```

**Interpolation:**
```typescript
t('settlement.owes', { from: 'Alice', to: 'Bob', amount: '€12.50' })
// → "Alice owes Bob €12.50"
```

**Plurals:**
```typescript
t('trips.detail.members_count', { count: 3 })
// → "3 members"  (uses key "trips.detail.members_count_other" when count ≠ 1)
```

**Outside React (error messages, hooks):**
```typescript
import i18next from '../i18n';
const message = i18next.t('common.error.generic');
```

---

## Locale detection and the future user preference

Today the locale comes from `getLocales()[0]?.languageCode`. To support a user-configurable language setting later, this logic is centralised in a `ILocalisationService`:

```typescript
// src/core/interfaces/ILocalisationService.ts
export interface ILocalisationService {
  /** The currently active locale code, e.g. 'en', 'fr' */
  getLocale(): string;
  /** Returns all supported locale codes */
  getSupportedLocales(): string[];
  /** Switches the active language and persists the preference */
  setLocale(locale: string): Promise<void>;
  /** Subscribe to language changes (e.g. to re-render the settings screen) */
  onLocaleChange(callback: (locale: string) => void): () => void;
}
```

The production implementation (`src/infrastructure/localisation/LocalisationServiceImpl.ts`) would:
1. On first call, read a stored preference from `SecureStore` (key: `weshare_locale_v1`)
2. Fall back to `getLocales()[0]?.languageCode` if no preference is stored
3. On `setLocale()`, call `i18next.changeLanguage(locale)` and write to `SecureStore`
4. Emit to subscribers so any component using `useTranslation()` re-renders automatically (react-i18next handles this)

The service is added to the DI container following the standard 4-step pattern when the settings screen is built. Until then, `i18next` is initialised directly in `src/i18n/index.ts` using the device locale — no DI plumbing needed for phase 1.

---

## Migration approach

Because the codebase is large, strings will be migrated feature-by-feature rather than in one pass.

**Recommended order** (highest user-visibility first):
1. `common` — Loading, Save, Cancel, Error, Retry (used everywhere)
2. `auth` — Welcome, sign-in buttons, guest flow
3. `trips` — list, detail, create/edit screens
4. `expenses` — form, detail, line items
5. `settlement` — settle-up screen, payment method sheet
6. `balance` — balance summary screen

**For each feature:**
1. Audit every `<Text>` and string prop (placeholder, accessibilityLabel, button label, error message) in the feature's `screens/` and `components/`
2. Add each unique string as a key in `en.json` with its English value
3. Replace the hardcoded string with `t('the.key')`
4. Add the French translation in `fr.json`

A string is in scope if a user reads it. A string is out of scope if it only appears in logs, Sentry events, or developer tooling.

---

## Testing strategy

- Unit tests for hooks and pure logic: pass `lng` option to `i18next.init` in the test setup and assert on translated output — tests run in English so existing snapshot strings remain valid
- Component tests: `react-i18next` provides a `I18nextProvider` wrapper for test renders; the test container can initialise i18next with the English bundle so `t()` returns real strings, not keys
- No mocking of `t()` — testing against real translated strings catches missing keys early

---

## What this does NOT cover

- RTL layout (Arabic, Hebrew) — not a target locale
- Date/time localisation — `Intl.DateTimeFormat` with the active locale handles this independently of i18next; `formatCurrency` already uses `Intl.NumberFormat` and only needs the locale code passed in
- Over-the-air translation updates — all strings are bundled; a new translation requires an app update
