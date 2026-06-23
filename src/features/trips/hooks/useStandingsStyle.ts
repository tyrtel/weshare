import { create } from 'zustand';

export type StandingsStyle = 'tinted' | 'list';

const VALID_STYLES = new Set<string>(['tinted', 'list']);
const DEFAULT_STYLE: StandingsStyle = 'tinted';

interface Store {
  style: StandingsStyle;
  setStyle: (s: StandingsStyle) => void;
}

export const useStandingsStyle = create<Store>(set => ({
  style: DEFAULT_STYLE,
  // Guard rejects any value not in the current valid set so that a persisted
  // 'person' preference from a previous build is silently corrected.
  setStyle: (s: StandingsStyle) => set({ style: VALID_STYLES.has(s) ? s : DEFAULT_STYLE }),
}));
