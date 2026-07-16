import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, View, Pressable, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { validateAndNormalizeEmail } from '../../../core/utils/emailValidation';

interface SendInviteSheetProps {
  visible: boolean;
  memberName: string;
  defaultEmail?: string;
  busy?: boolean;
  onConfirm: (email: string) => void;
  onClose: () => void;
}

// Same Modal/backdrop/handle-bar/confirm-cancel structure as
// settlement/components/RecordPaymentSheet — a plain email TextInput in place
// of the amount input.
export function SendInviteSheet({
  visible,
  memberName,
  defaultEmail,
  busy = false,
  onConfirm,
  onClose,
}: SendInviteSheetProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset the entered email each time the sheet opens for a (possibly
  // different) member — a prop-driven state reset during render, not a
  // useEffect, since the sheet can stay mounted across visible transitions.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setEmail(defaultEmail ?? '');
  }

  const isEmailValid = validateAndNormalizeEmail(email).error === null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel={t('groups.send_invite.close_label')}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
          }}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <View style={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl }}>
            <Text variant="heading3" style={{ marginBottom: tokens.spacing.xs }}>
              {t('groups.send_invite.title')}
            </Text>
            <Text variant="body" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
              {t('groups.send_invite.subtitle', { name: memberName })}
            </Text>

            <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
              {t('groups.send_invite.email_label')}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('groups.send_invite.email_placeholder')}
              placeholderTextColor={colors.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('groups.send_invite.email_label')}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: tokens.radius.md,
                paddingHorizontal: tokens.spacing.md,
                paddingVertical: tokens.spacing.sm,
                color: colors.text.primary,
              }}
            />

            {!isEmailValid && email.length > 0 && (
              <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.xs }}>
                {t('groups.send_invite.invalid_email')}
              </Text>
            )}

            <Pressable
              onPress={() => { if (isEmailValid && !busy) onConfirm(email.trim()); }}
              disabled={!isEmailValid || busy}
              accessibilityRole="button"
              accessibilityLabel={t('groups.send_invite.confirm_label')}
              style={({ pressed }) => ({
                marginTop: tokens.spacing.lg,
                backgroundColor: colors.primary.default,
                borderRadius: tokens.radius.pill,
                paddingVertical: tokens.spacing.sm,
                alignItems: 'center',
                opacity: !isEmailValid || busy || pressed ? 0.6 : 1,
              })}
            >
              {busy
                ? <ActivityIndicator size="small" color={colors.text.inverse} />
                : <Text variant="label" color={colors.text.inverse}>{t('groups.send_invite.confirm_button')}</Text>
              }
            </Pressable>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('groups.send_invite.cancel')}
              style={({ pressed }) => ({
                marginTop: tokens.spacing.md,
                alignItems: 'center',
                paddingVertical: tokens.spacing.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label" color={colors.text.secondary}>{t('groups.send_invite.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
