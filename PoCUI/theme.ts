// Design tokens — "Ledger" design language.
// Palette is built around an accountant's ledger: green-black ink on cool
// paper, with balance semantics carried by exactly two hues (owed / owes).

export const palette = {
  ink: '#182420',        // primary text — green-black ledger ink
  inkSoft: '#5C6B63',    // secondary text
  inkFaint: '#95A29B',   // tertiary / placeholders

  mist: '#F2F5F1',       // app background
  paper: '#FFFFFF',      // cards, receipt
  line: '#E4EAE3',       // hairlines
  lineStrong: '#CBD5CD',

  spruce: '#0E6B4F',     // primary action
  spruceDeep: '#0A4A38', // pressed state
  spruceTint: '#E2F1EA', // selected chips, soft fills

  owed: '#12946A',       // money coming to you
  owedTint: '#DDF2E9',
  owes: '#D9532B',       // money you owe
  owesTint: '#FBE7DE',

  butter: '#F2C94C',     // activity indicator only — use sparingly
};

export const type = {
  // Load via @expo-google-fonts (see README). Space Grotesk carries all
  // numerals and display text; Inter carries body copy and labels.
  display: 'SpaceGrotesk_700Bold',
  displayMed: 'SpaceGrotesk_500Medium',
  mono: 'SpaceGrotesk_500Medium', // used with tabular-nums for money
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const space = (n: number) => n * 4;

export const shadow = {
  card: {
    shadowColor: '#182420',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

// Money is always rendered with tabular numerals so columns align.
export const moneyStyle = {
  fontFamily: type.mono,
  fontVariant: ['tabular-nums'] as const,
};

export const fmtMoney = (cents: number, sign = false) => {
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sign) return `€${s}`;
  return `${cents < 0 ? '−' : '+'}€${s}`;
};
