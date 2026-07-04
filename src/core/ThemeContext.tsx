import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'react-native';
import { ledgerColors, getColors } from '../theme/colors';
import type { ColorPalette } from '../theme/colors';

export type ActiveTheme = 'default' | 'ledger';

const STORE_KEY = 'weshare_active_theme';

interface ThemeCtx {
  theme: ActiveTheme;
  setTheme: (t: ActiveTheme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'default', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ActiveTheme>('default');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then(val => {
        if (val === 'ledger' || val === 'default') setThemeState(val);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setTheme = useCallback((t: ActiveTheme) => {
    setThemeState(t);
    SecureStore.setItemAsync(STORE_KEY, t).catch(() => {});
  }, []);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useActiveTheme(): ActiveTheme {
  return useContext(ThemeContext).theme;
}

export function useSetTheme(): (t: ActiveTheme) => void {
  return useContext(ThemeContext).setTheme;
}

export function useThemeColors(): ColorPalette {
  const theme = useActiveTheme();
  const scheme = useColorScheme();
  return theme === 'ledger' ? ledgerColors : getColors(scheme);
}
