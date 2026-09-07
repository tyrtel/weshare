import { StyleSheet } from 'react-native';
import type { ColorPalette } from '../../../theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';

// Shared by ExpenseFormScreen and the components it composes (ExpenseAmountCard,
// PayerPicker, SplitModeSection, LineItemEntryList, ExpenseSummaryHeader) so
// the add-mode two-step flow and the edit-mode single screen render pixel-identical
// cards, rows, and text from one style source.
export const makeExpenseFormStyles = (colors: ColorPalette) => StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  screenTitle: { fontFamily: ledgerFonts.display, fontSize: 19, color: colors.text.primary },
  stepIndicator: { fontSize: 12, fontWeight: '500', color: colors.text.tertiary, marginTop: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  // The currency symbol (a Text) gets an explicit lineHeight — SpaceGrotesk's
  // line box at this size runs tight against its own glyph metrics and Text
  // handles an enlarged lineHeight correctly. amountInput (a TextInput,
  // below) deliberately does NOT: RN's TextInput measures lineHeight
  // differently from Text on Android, especially paired with the row's
  // alignItems (now 'center', not 'baseline' — baseline made an oversized
  // lineHeight measure even more wrong) — it clipped *worse* with lineHeight
  // set than with the platform default. Use textAlignVertical + padding + the
  // row's own minHeight for headroom instead.
  currency: { fontFamily: ledgerFonts.displaySemibold, fontSize: 26, lineHeight: 32, color: colors.text.secondary },
  amountInput: {
    fontFamily: ledgerFonts.display,
    fontSize: 44, color: colors.text.primary,
    minWidth: 140, paddingHorizontal: 4, paddingVertical: 4,
    textAlign: 'center', textAlignVertical: 'center',
  },
  titleInput: {
    fontSize: 15, color: colors.text.primary, textAlign: 'center',
    borderTopWidth: 1, borderColor: colors.border,
    paddingTop: 12, marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8,
  },
  rateText: { fontSize: 12, color: colors.text.secondary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { height: 1, backgroundColor: colors.border },
  splitName: { fontSize: 14.5, fontWeight: '500', color: colors.text.primary, flex: 1 },
  splitAmount: { fontFamily: ledgerFonts.displaySemibold, fontSize: 14, lineHeight: 20, color: colors.text.primary, fontVariant: ['tabular-nums'] },
  convertedAmount: { fontFamily: ledgerFonts.body, fontSize: 11, lineHeight: 16, fontWeight: '400', color: colors.text.tertiary, fontVariant: ['tabular-nums'] },
  check: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary.default, borderColor: colors.primary.default },
  exactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.background, borderRadius: ledgerRadius.sm, paddingHorizontal: 10, height: 38,
  },
  exactInput: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: colors.text.primary, minWidth: 62, textAlign: 'right' },
  saveBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: ledgerRadius.md,
    backgroundColor: colors.primary.default,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  currencySheet: {
    backgroundColor: colors.surface,
    borderRadius: ledgerRadius.card,
    overflow: 'hidden',
    maxHeight: '70%',
    ...ledgerShadow.card,
  },
  currencySheetHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
});

export type ExpenseFormStyles = ReturnType<typeof makeExpenseFormStyles>;
