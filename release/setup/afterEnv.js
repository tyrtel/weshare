// The app's logger prints every store read/write in dev builds. Keep release
// output to test results unless RELEASE_VERBOSE=1.
if (process.env.RELEASE_VERBOSE !== '1') {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}

// Hooks rendered outside a navigator behave as if their screen is focused.
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    ...jest.requireActual('expo-router'),
    useFocusEffect: cb => React.useEffect(cb, [cb]),
  };
});
