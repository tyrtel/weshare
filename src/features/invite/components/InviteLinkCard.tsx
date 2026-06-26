import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface InviteLinkCardProps {
  inviteUrl: string;
  onShare: () => void;
}

export function InviteLinkCard({ inviteUrl, onShare }: InviteLinkCardProps) {
  const { t } = useTranslation();
  const colors = useColors();

  const handleCopy = () => {
    Clipboard.setString(inviteUrl);
  };

  return (
    <View>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.sm }}
      >
        {t('invite.link_card.title')}
      </Text>

      <Pressable
        onPress={handleCopy}
        accessibilityRole="button"
        accessibilityLabel={t('invite.link_card.copy_label')}
        style={{
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.pill,
          borderWidth: 1,
          borderColor: colors.primary.dim,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
          marginBottom: tokens.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text
          variant="caption"
          color={colors.primary.light}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {inviteUrl}
        </Text>
        <Ionicons
          name="copy-outline"
          size={16}
          color={colors.text.tertiary}
          style={{ marginLeft: tokens.spacing.sm }}
        />
      </Pressable>

      <Button label={t('invite.link_card.share_button')} onPress={onShare} />
    </View>
  );
}
