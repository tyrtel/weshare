const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// zustand's package.json "exports" map resolves web builds to its ESM output
// (zustand/esm/middleware.mjs), which references `import.meta` for a
// devtools-only dev-mode check. Metro serves web bundles as plain scripts,
// where `import.meta` is a syntax error, so package-exports resolution must
// be disabled to fall back to the plain CJS build (zustand/middleware.js),
// which has no import.meta reference. Native (iOS/Android) already avoided
// this via the "react-native" exports condition, so this only affects web.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;