import React, { createContext, useContext } from 'react';
import { ledgerColors } from '../theme/colors';
import type { ColorPalette } from '../theme/colors';

// Single theme only: the PoCUI "Ledger" light design. No switching.
export type ActiveTheme = 'ledger';

interface ThemeCtx {
  theme: ActiveTheme;
  setTheme: (t: ActiveTheme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'ledger', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: 'ledger', setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useActiveTheme(): ActiveTheme {
  return 'ledger';
}

export function useSetTheme(): (t: ActiveTheme) => void {
  return () => {};
}

export function useThemeColors(): ColorPalette {
  return ledgerColors;
}
