import type React from 'react';
import type { TripMember } from '../../../../core/models/TripMember';
import type { ExpenseLineItem } from '../../../../core/models/Expense';
import type { ExpenseFormStyles } from '../../screens/expenseFormStyles';

// Shared contract for any itemized-split editor UI (entry + per-item member
// assignment). ItemizedSplitSheet renders whichever component the registry
// resolves for a given key against these same props — a future "flashier"
// editor is just a second component satisfying this interface, dropped into
// the registry under a new key, with no changes needed anywhere else.
export interface ItemizedSplitEditorProps {
  items: ExpenseLineItem[];
  members: TripMember[];
  currency: string;
  totalAmountCents: number;
  itemRaw: Record<string, string>;
  setItemRaw: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onUpdateItem: (id: string, changes: Partial<Pick<ExpenseLineItem, 'description' | 'amountCents'>>) => void;
  onRemoveItem: (id: string) => void;
  onAddItem: () => void;
  onToggleMember: (itemId: string, userId: string) => void;
  fromMinorUnits: (minorUnits: number, currency: string) => string;
  toMinorUnits: (majorValue: string, currency: string) => number;
  sanitizeAmountInput: (v: string) => string;
  convertedLabel: (amountMinor: number) => string | null;
  styles: ExpenseFormStyles;
}
