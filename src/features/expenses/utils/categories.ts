export interface ExpenseCategory {
  id: string;
  label: string;
  icon: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'food',          label: 'Food & Drink',    icon: 'restaurant-outline' },
  { id: 'transport',     label: 'Transport',        icon: 'car-outline' },
  { id: 'accommodation', label: 'Accommodation',    icon: 'bed-outline' },
  { id: 'activities',    label: 'Activities',       icon: 'bicycle-outline' },
  { id: 'shopping',      label: 'Shopping',         icon: 'bag-outline' },
  { id: 'other',         label: 'Other',            icon: 'ellipsis-horizontal-outline' },
];

export function categoryById(id: string | undefined): ExpenseCategory | undefined {
  if (!id) return undefined;
  return EXPENSE_CATEGORIES.find(c => c.id === id);
}
