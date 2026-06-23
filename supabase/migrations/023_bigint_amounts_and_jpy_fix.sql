-- Widen amount columns from 32-bit integer (max ~2.1 B) to 64-bit bigint.
-- This eliminates overflow for large JPY amounts (¥21 M+ would previously
-- corrupt silently against the INT ceiling).
ALTER TABLE expenses ALTER COLUMN total_amount_cents TYPE bigint;
ALTER TABLE splits   ALTER COLUMN amount_owed_cents  TYPE bigint;
ALTER TABLE splits   ALTER COLUMN amount_paid_cents  TYPE bigint;

-- Fix existing JPY data that was stored with an incorrect ×100 multiplier.
-- The app previously treated every currency as two-decimal and multiplied
-- user input by 100 before storing it. JPY has no subunit, so ¥50,000 was
-- written as 5,000,000. Divide splits first (while the join on expenses is
-- still intact), then divide expenses.
UPDATE splits
   SET amount_owed_cents = amount_owed_cents / 100,
       amount_paid_cents = amount_paid_cents / 100
  FROM expenses
 WHERE splits.expense_id = expenses.id
   AND expenses.currency = 'JPY';

UPDATE expenses
   SET total_amount_cents = total_amount_cents / 100
 WHERE currency = 'JPY';
