// Domain types + fixtures. Amounts are integer cents.

export type Member = {
  id: string;
  name: string;
  initials: string;
  hue: string; // avatar background
};

export type SplitMode = 'even' | 'proportion' | 'exact' | 'itemized';

export type ReceiptItem = {
  id: string;
  label: string;
  amount: number;
  assignees: string[]; // member ids; item is divided among them
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  date: string;
  icon: string; // Feather icon name
  split: {
    mode: SplitMode;
    // even: participants[]
    // proportion: weights { memberId: number }
    // exact: amounts { memberId: cents }
    // itemized: items[]
    participants?: string[];
    weights?: Record<string, number>;
    amounts?: Record<string, number>;
    items?: ReceiptItem[];
  };
};

export type Trip = {
  id: string;
  name: string;
  emoji: string;
  dates: string;
  participantIds: string[];
  expenses: Expense[];
  settled: boolean;
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  lastActivity: string; // human string for the landing card
  lastActivityAt: string;
  balances: Record<string, number>; // net cents per member (+ is owed)
  tripIds: string[];
  expenses: Expense[]; // one-off + recurring
  recurring: { id: string; title: string; amount: number; cadence: string; icon: string }[];
};

export const ME = 'u-jay';

export const MEMBERS: Record<string, Member> = {
  'u-jay':  { id: 'u-jay',  name: 'You',     initials: 'J',  hue: '#0E6B4F' },
  'u-lea':  { id: 'u-lea',  name: 'Léa',     initials: 'L',  hue: '#7C5CBF' },
  'u-marc': { id: 'u-marc', name: 'Marc',    initials: 'M',  hue: '#B0713A' },
  'u-sof':  { id: 'u-sof',  name: 'Sofia',   initials: 'S',  hue: '#2B6CB0' },
  'u-tom':  { id: 'u-tom',  name: 'Tomás',   initials: 'T',  hue: '#C74B6B' },
};

export const TRIPS: Trip[] = [
  {
    id: 't-lisbon',
    name: 'Lisbon weekend',
    emoji: '🇵🇹',
    dates: 'Jun 19 – 22',
    participantIds: ['u-jay', 'u-lea', 'u-sof', 'u-tom'],
    settled: false,
    expenses: [
      {
        id: 'e1', title: 'Cervejaria Ramiro', amount: 14280, payerId: 'u-jay',
        date: 'Jun 20', icon: 'coffee',
        split: {
          mode: 'itemized',
          items: [
            { id: 'i1', label: 'Garlic prawns', amount: 2400, assignees: ['u-jay', 'u-lea'] },
            { id: 'i2', label: 'Percebes', amount: 3800, assignees: ['u-sof'] },
            { id: 'i3', label: 'Crab', amount: 4200, assignees: ['u-jay', 'u-lea', 'u-sof', 'u-tom'] },
            { id: 'i4', label: 'Vinho verde ×2', amount: 2680, assignees: ['u-lea', 'u-tom'] },
            { id: 'i5', label: 'Bread & couvert', amount: 1200, assignees: ['u-jay', 'u-lea', 'u-sof', 'u-tom'] },
          ],
        },
      },
      {
        id: 'e2', title: 'Airbnb — Alfama', amount: 42000, payerId: 'u-sof',
        date: 'Jun 19', icon: 'home',
        split: { mode: 'even', participants: ['u-jay', 'u-lea', 'u-sof', 'u-tom'] },
      },
      {
        id: 'e3', title: 'Tram day passes', amount: 2560, payerId: 'u-lea',
        date: 'Jun 20', icon: 'map',
        split: { mode: 'even', participants: ['u-jay', 'u-lea', 'u-sof', 'u-tom'] },
      },
    ],
  },
  {
    id: 't-alps',
    name: 'Chamonix ski',
    emoji: '⛷️',
    dates: 'Feb 6 – 9',
    participantIds: ['u-jay', 'u-marc', 'u-tom'],
    settled: true,
    expenses: [],
  },
];

export const GROUPS: Group[] = [
  {
    id: 'g-flat',
    name: 'Rue Gambetta flat',
    emoji: '🏠',
    memberIds: ['u-jay', 'u-lea', 'u-marc'],
    lastActivity: 'Léa added “Electricity — June”',
    lastActivityAt: '2h ago',
    balances: { 'u-jay': 6430, 'u-lea': -2210, 'u-marc': -4220 },
    tripIds: [],
    recurring: [
      { id: 'r1', title: 'Rent', amount: 145000, cadence: 'Monthly · 1st', icon: 'home' },
      { id: 'r2', title: 'Internet', amount: 3499, cadence: 'Monthly · 5th', icon: 'wifi' },
    ],
    expenses: [
      { id: 'ge1', title: 'Electricity — June', amount: 8940, payerId: 'u-lea', date: '2h ago', icon: 'zap',
        split: { mode: 'even', participants: ['u-jay', 'u-lea', 'u-marc'] } },
      { id: 'ge2', title: 'Cleaning supplies', amount: 2310, payerId: 'u-jay', date: 'Mon', icon: 'droplet',
        split: { mode: 'even', participants: ['u-jay', 'u-lea', 'u-marc'] } },
    ],
  },
  {
    id: 'g-crew',
    name: 'Toulouse crew',
    emoji: '🥐',
    memberIds: ['u-jay', 'u-sof', 'u-tom', 'u-marc'],
    lastActivity: 'You paid Tomás €18.50',
    lastActivityAt: 'Yesterday',
    balances: { 'u-jay': -1850, 'u-sof': 4100, 'u-tom': 900, 'u-marc': -3150 },
    tripIds: ['t-lisbon'],
    recurring: [],
    expenses: [
      { id: 'ce1', title: 'Padel court', amount: 3200, payerId: 'u-sof', date: 'Sat', icon: 'target',
        split: { mode: 'proportion', weights: { 'u-jay': 1, 'u-sof': 1, 'u-tom': 2 } } },
    ],
  },
];

// Net position across everything, for the home header.
export const myNet = () => {
  let net = 0;
  for (const g of GROUPS) net += g.balances[ME] ?? 0;
  return net;
};
