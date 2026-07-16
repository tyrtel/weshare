import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeStoreState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    set => ({
      preference: 'system',
      setPreference: preference => set({ preference }),
    }),
    {
      name: 'weshare-theme-preference',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function useResolvedTheme(): 'light' | 'dark' {
  const preference = useThemeStore(s => s.preference);
  const systemScheme = useColorScheme();
  return preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
}
