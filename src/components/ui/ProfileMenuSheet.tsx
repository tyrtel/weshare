import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { Segmented } from './Segmented';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../store/themeStore';
import type { ThemePreference } from '../../store/themeStore';

interface ProfileMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  onNewTrip: () => void;
  onNewGroup: () => void;
  onLogOut: () => void;
}

// Bottom sheet, not an anchored dropdown — matches the app's existing
// RecordPaymentSheet/SendInviteSheet pattern rather than introducing a new
// popover-menu UI concept.
export function ProfileMenuSheet({ visible, onClose, onNewTrip, onNewGroup, onLogOut }: ProfileMenuSheetProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const preference = useThemeStore(s => s.preference);
  const setPreference = useThemeStore(s => s.setPreference);

  const row = (
    icon: React.ComponentProps<typeof Feather>['name'],
    label: string,
    onPress: () => void,
    destructive = false,
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
        paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Feather name={icon} size={19} color={destructive ? colors.error.default : colors.text.primary} />
      <Text variant="body" color={destructive ? colors.error.default : colors.text.primary}>{label}</Text>
    </Pressable>
  );

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
          accessibilityLabel={t('home.profile_menu.close_label')}
        />

        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card }}>
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <View style={{ paddingBottom: tokens.spacing.xxl }}>
            {row('send', t('trips.list.fab_label'), () => { onClose(); onNewTrip(); })}
            {row('users', t('groups.create.fab_label'), () => { onClose(); onNewGroup(); })}

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: tokens.spacing.xs }} />

            <View style={{ paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm, gap: tokens.spacing.sm }}>
              <Text variant="caption" color={colors.text.secondary}>{t('home.profile_menu.theme_label')}</Text>
              <Segmented
                options={[
                  { key: 'light', label: t('home.profile_menu.theme_light') },
                  { key: 'dark', label: t('home.profile_menu.theme_dark') },
                  { key: 'system', label: t('home.profile_menu.theme_system') },
                ]}
                value={preference}
                onChange={(key) => setPreference(key as ThemePreference)}
              />
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: tokens.spacing.xs }} />

            {row('log-out', t('home.profile_menu.log_out'), () => { onClose(); onLogOut(); }, true)}
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
