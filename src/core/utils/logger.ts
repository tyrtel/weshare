declare const __DEV__: boolean;

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  log:   (...args: unknown[]): void => { if (isDev) console.log(...args); },
  warn:  (...args: unknown[]): void => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]): void => { if (isDev) console.error(...args); },
};
