import * as Sentry from '@sentry/react-native';

declare const __DEV__: boolean;

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) { console.log(...args); return; }
    Sentry.addBreadcrumb({ category: 'log', message: args.map(String).join(' '), level: 'info' });
  },
  warn: (...args: unknown[]): void => {
    if (isDev) { console.warn(...args); return; }
    Sentry.addBreadcrumb({ category: 'log', message: args.map(String).join(' '), level: 'warning' });
  },
  error: (...args: unknown[]): void => {
    if (isDev) { console.error(...args); return; }
    const err = args.find((a): a is Error => a instanceof Error);
    if (err) Sentry.captureException(err);
    else Sentry.captureMessage(args.map(String).join(' '), 'error');
  },
};
