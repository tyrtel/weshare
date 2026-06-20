import { create } from 'zustand';

export type StandingsStyle = 'tinted' | 'person' | 'list';

interface Store {
  style: StandingsStyle;
  setStyle: (s: StandingsStyle) => void;
}

export const useStandingsStyle = create<Store>(set => ({
  style: 'list',
  setStyle: style => set({ style }),
}));
