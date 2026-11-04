import React from 'react';
import { View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Segmented } from './Segmented';
import { ErrorBanner } from './ErrorBanner';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { confirm } from '../../core/utils/confirm';
import { INVITE_TTL_OPTIONS, inviteLinkStatus, timeRemaining } from '../../core/logic/inviteLink';
import type { AppError } from '../../core/types/AppError';

interface InviteLinkSettingsProps {
  createdAt?: Date;
  ttlHours?: number | null;
  closed?: boolean;
  canManage: boolean;
  busy: boolean;
  error: AppError | null;
  onChangeTtl: (ttlHours: number | null) => void;
  onReset: () => void;
}

const ttlKey = (ttl: number | null | undefined) => (ttl == null ? 'never' : String(ttl));

export function InviteLinkSettings({
  createdAt, ttlHours, closed = false, canManage, busy, error, onChangeTtl, onReset,
}: InviteLinkSettingsProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const status = inviteLinkStatus(createdAt, ttlHours, new Date(), closed);

  let statusText: string;
  switch (status.kind) {
    case 'never':
      statusText = t('invite_link.never_expires');
      break;
    case 'expires': {
      const { unit, count } = timeRemaining(status.at, new Date());
      statusText = t(`invite_link.expires_in_${unit}`, { count });
      break;
    }
    case 'expired':
      statusText = t('invite_link.expired');
      break;
    case 'closed':
      statusText = t('invite_link.closed');
      break;
  }
  const inactive = status.kind === 'expired' || status.kind === 'closed';
  const ttlLabels: Record<string, string> = {
    '24':    t('invite_link.ttl_24'),
    '168':   t('invite_link.ttl_168'),
    '720':   t('invite_link.ttl_720'),
    'never': t('invite_link.ttl_never'),
  };

  const confirmReset = () => {
    void confirm(t('invite_link.reset_confirm_title'), t('invite_link.reset_confirm_body'), t('invite_link.reset_confirm_action'))
      .then(confirmed => { if (confirmed) onReset(); });
  };

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
        <Ionicons
          name={inactive ? 'alert-circle-outline' : 'time-outline'}
          size={16}
          color={inactive ? colors.warning.default : colors.text.secondary}
        />
        <Text variant="caption" color={inactive ? colors.warning.default : colors.text.secondary} style={{ flex: 1 }}>
          {statusText}
        </Text>
      </View>

      {!canManage && inactive && status.kind !== 'closed' && (
        <Text variant="caption" color={colors.text.secondary}>{t('invite_link.ask_owner')}</Text>
      )}

      {canManage && !closed && (
        <>
          <Text variant="caption" color={colors.text.secondary}>{t('invite_link.lifetime_label')}</Text>
          <Segmented
            options={INVITE_TTL_OPTIONS.map(ttl => ({ key: ttlKey(ttl), label: ttlLabels[ttlKey(ttl)] }))}
            value={ttlKey(ttlHours)}
            onChange={key => { if (!busy) onChangeTtl(key === 'never' ? null : Number(key)); }}
          />
          <Pressable
            onPress={confirmReset}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('invite_link.reset_button')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.spacing.xs,
              paddingVertical: tokens.spacing.xs,
              opacity: pressed || busy ? 0.6 : 1,
            })}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.primary.default} />
            <Text variant="label" color={colors.primary.default}>{t('invite_link.reset_button')}</Text>
          </Pressable>
        </>
      )}

      <ErrorBanner error={error} fallback={t('invite_link.error_fallback')} />
    </View>
  );
}
