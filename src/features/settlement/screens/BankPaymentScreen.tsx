import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { IBANInputField } from '../../../components/ui/IBANInputField';
import { SplitStatusBadge } from '../../../components/ui/SplitStatusBadge';
import { PaymentProofCard } from '../../../components/ui/PaymentProofCard';
import { BankSelectorSheet } from '../components/BankSelectorSheet';
import { useService } from '../../../core/di/ServiceContext';
import { OPEN_BANKING, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { useStatusPoller } from '../../../hooks/useStatusPoller';
import { generateId } from '../../../core/utils/generateId';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Bank } from '../../../core/interfaces/IBankListService';
import type { SplitRequest, SplitRequestStatus } from '../../../core/models/SplitRequest';

const POLL_INTERVAL_MS = 8000;

const TERMINAL: readonly SplitRequestStatus[] = ['completed', 'declined', 'expired'];

const bankPaymentParamsSchema = z.object({
  tripId:          z.string().min(1),
  payerUserId:     z.string().min(1),
  requesterUserId: z.string().min(1),
  amountCents:     z.coerce.number().int().positive(),
  currency:        z.string().min(1),
  recipientName:   z.string().default(''),
});
type BankPaymentParams = z.infer<typeof bankPaymentParamsSchema>;

export function BankPaymentScreen() {
  const raw    = useLocalSearchParams();
  const parsed = bankPaymentParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Text variant="body">Invalid payment parameters.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <BankPaymentScreenContent params={parsed.data} />;
}

function BankPaymentScreenContent({ params }: { params: BankPaymentParams }) {
  const { tripId, payerUserId, requesterUserId, amountCents, currency, recipientName } = params;

  const router      = useRouter();
  const colors      = useColors();
  const ob               = useService(OPEN_BANKING);
  const splitRequestRepo = useService(SPLIT_REQUEST_REPO);

  const [iban, setIban]                   = useState('');
  const [ibanValid, setIbanValid]         = useState(false);
  const [selectedBank, setSelectedBank]   = useState<Bank | null>(null);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [activeReq, setActiveReq]         = useState<SplitRequest | null>(null);
  const [status, setStatus]               = useState<SplitRequestStatus | null>(null);

  const isTerminal = status !== null && TERMINAL.includes(status);

  useStatusPoller(
    async () => {
      if (!activeReq?.obPaymentId || !activeReq?.obProvider) return null;
      const result = await ob.getPaymentStatus(activeReq.obPaymentId, activeReq.obProvider);
      return isOk(result) ? result.value : null;
    },
    POLL_INTERVAL_MS,
    (next) => {
      setStatus(next);
      if (TERMINAL.includes(next) && activeReq) {
        void splitRequestRepo.updateSplitRequest({ ...activeReq, status: next, updatedAt: new Date() });
      }
    },
    !!activeReq?.obPaymentId && !isTerminal,
  );

  const handleSubmit = async () => {
    if (!ibanValid || submitting) return;
    setSubmitting(true);

    try {
      const now   = new Date();
      const reqId = generateId();

      // 1. Save a provisional SplitRequest so there's an audit record.
      const provisional: SplitRequest = {
        id:                  reqId,
        tripId,
        requesterUserId,
        payerUserId,
        amountCents,
        currency,
        note:                `ouiShare SEPA to ${recipientName || 'recipient'}`,
        status:              'created',
        preferredWallet:     'other',
        externalRefId:       null,
        stripePaymentLinkId: null,
        stripeSessionId:     null,
        obPaymentId:         null,
        obProvider:          null,
          rolledOverFromTripId: null,
        createdAt:           now,
        updatedAt:           now,
      };
      await splitRequestRepo.saveSplitRequest(provisional);

      // 2. Initiate the OB payment — get authorization URL + OB payment ID.
      const result = await ob.initiatePayment(
        reqId,
        amountCents,
        currency,
        provisional.note,
        iban,
      );

      if (!isOk(result)) {
        Alert.alert('Payment failed', 'Could not initiate bank transfer. Please try again.');
        await splitRequestRepo.updateSplitRequest({ ...provisional, status: 'declined', updatedAt: new Date() });
        return;
      }

      const { authorizationUrl, obPaymentId, obProvider } = result.value;

      // 3. Update record with OB fields and new status.
      const sentReq: SplitRequest = {
        ...provisional,
        status:      'request_sent',
        obPaymentId,
        obProvider,
        updatedAt:   new Date(),
      };
      await splitRequestRepo.updateSplitRequest(sentReq);
      setActiveReq(sentReq);
      setStatus('request_sent');

      // 4. Open the bank authorization URL.
      await ob.openAuthorizationUrl(authorizationUrl);

    } finally {
      setSubmitting(false);
    }
  };

  const amountFormatted = formatCurrency(amountCents, currency);

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Bank Transfer', headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={{
          padding:       tokens.spacing.lg,
          paddingBottom: tokens.spacing.lg + TAB_BAR_HEIGHT,
          gap:           tokens.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Summary header */}
        <View style={{
          backgroundColor: colors.surfaceAlt,
          borderRadius:    tokens.radius.card,
          padding:         tokens.spacing.md,
          gap:             tokens.spacing.xs,
        }}>
          <Text variant="heading3">SEPA Bank Transfer</Text>
          <Text variant="body" color={colors.text.secondary}>
            Sending {amountFormatted} to {recipientName || 'recipient'}
          </Text>
        </View>

        {/* Bank + IBAN inputs — only shown before initiation */}
        {!activeReq && (
          <View style={{ gap: tokens.spacing.sm }}>
            {/* Optional bank selection */}
            <Text variant="label" color={colors.text.secondary}>Bank (optional)</Text>
            <Pressable
              onPress={() => setBankSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={selectedBank ? `Selected bank: ${selectedBank.name}` : 'Select your bank'}
              style={({ pressed }) => ({
                flexDirection:     'row',
                alignItems:        'center',
                backgroundColor:   colors.surfaceAlt,
                borderRadius:      tokens.radius.md,
                padding:           tokens.spacing.sm,
                opacity:           pressed ? 0.7 : 1,
              })}
            >
              <Ionicons
                name={selectedBank ? 'business' : 'business-outline'}
                size={18}
                color={selectedBank ? colors.primary.default : colors.text.tertiary}
                style={{ marginRight: tokens.spacing.sm }}
              />
              <Text
                variant="body"
                color={selectedBank ? colors.text.primary : colors.text.tertiary}
                style={{ flex: 1 }}
              >
                {selectedBank ? selectedBank.name : 'Select your bank…'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
            </Pressable>
            {selectedBank && (
              <Pressable onPress={() => setSelectedBank(null)} accessibilityLabel="Clear bank selection">
                <Text variant="caption" color={colors.text.tertiary}>Clear bank selection</Text>
              </Pressable>
            )}

            <Text variant="label" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
              Your IBAN (creditor account)
            </Text>
            <IBANInputField
              value={iban}
              onChange={(raw, valid) => { setIban(raw); setIbanValid(valid); }}
            />
            <Text variant="caption" color={colors.text.tertiary}>
              We need the IBAN you want to receive funds into. This is passed securely to your bank.
            </Text>
          </View>
        )}

        <BankSelectorSheet
          visible={bankSheetOpen}
          onSelect={(bank) => setSelectedBank(bank)}
          onClose={() => setBankSheetOpen(false)}
        />

        {/* In-progress state after initiation */}
        {activeReq && (
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{
              flexDirection:  'row',
              alignItems:     'center',
              justifyContent: 'space-between',
            }}>
              <Text variant="label">Payment status</Text>
              {status && <SplitStatusBadge status={status} />}
            </View>

            {(status === 'request_sent' || status === 'authorized') && (
              <View style={{ gap: tokens.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                  <ActivityIndicator color={colors.primary.default} />
                  <Text variant="body" color={colors.text.secondary}>
                    Waiting for your bank to confirm…
                  </Text>
                </View>
                <Text variant="caption" color={colors.text.tertiary}>
                  You may need to approve the transfer in your bank&apos;s app or website.
                  Return here once you&apos;ve authorized the payment.
                </Text>
              </View>
            )}

            {status === 'authorized' && (
              <View style={{
                backgroundColor: colors.success.default + '20',
                borderRadius:    tokens.radius.md,
                padding:         tokens.spacing.md,
              }}>
                <Text variant="label" color={colors.success.default}>
                  Bank authorized — SEPA transfer in transit
                </Text>
                <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
                  SEPA transfers typically settle within 1 business day.
                </Text>
              </View>
            )}

            {status === 'completed' && (
              <>
                <View style={{
                  backgroundColor: colors.success.default + '20',
                  borderRadius:    tokens.radius.md,
                  padding:         tokens.spacing.md,
                  gap:             tokens.spacing.xs,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success.default} />
                    <Text variant="label" color={colors.success.default}>Transfer complete</Text>
                  </View>
                  {activeReq.obPaymentId && (
                    <Text variant="caption" color={colors.text.secondary}>
                      Reference: {activeReq.obPaymentId}
                    </Text>
                  )}
                </View>
                <PaymentProofCard
                  splitRequest={{ ...activeReq, status }}
                  payeeName={recipientName || undefined}
                />
              </>
            )}

            {(status === 'declined' || status === 'expired') && (
              <View style={{
                backgroundColor: colors.error.default + '20',
                borderRadius:    tokens.radius.md,
                padding:         tokens.spacing.md,
              }}>
                <Text variant="label" color={colors.error.default}>
                  {status === 'declined' ? 'Payment declined by bank' : 'Authorization expired'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* CTA — hidden once complete/failed */}
        {!activeReq && (
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={!ibanValid || submitting}
            accessibilityRole="button"
            accessibilityLabel="Pay via bank transfer"
            style={({ pressed }) => ({
              backgroundColor: ibanValid && !submitting ? colors.primary.default : colors.border,
              borderRadius:    tokens.radius.md,
              paddingVertical: tokens.spacing.md,
              alignItems:      'center',
              opacity:         pressed ? 0.8 : 1,
            })}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text variant="label" color="#fff">Pay via bank transfer</Text>
            }
          </Pressable>
        )}

        {activeReq && (status === 'declined' || status === 'expired') && (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: colors.primary.default,
              borderRadius:    tokens.radius.md,
              paddingVertical: tokens.spacing.md,
              alignItems:      'center',
              opacity:         pressed ? 0.8 : 1,
            })}
          >
            <Text variant="label" color="#fff">Go back</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}
