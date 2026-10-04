import React from 'react';
import { View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { describeActivityEvent } from '../utils/describeActivityEvent';
import { resolveBreadcrumb } from '../utils/resolveBreadcrumb';
import type { ActivityEvent } from '../../../core/models/ActivityEvent';
import type { Group } from '../../../core/models/Group';
import type { Trip } from '../../../core/models/Trip';

interface Props {
  event:  ActivityEvent;
  groups: Group[];
  trips:  Trip[];
}

function formatEventTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ActivityFeedItem({ event, groups, trips }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();

  const { iconName, i18nKey, i18nParams } = describeActivityEvent(event);
  const segments = resolveBreadcrumb(event, groups, trips, t('history.unknown_expense'));

  return (
    <View style={{ flexDirection: 'row', paddingVertical: tokens.spacing.sm, gap: tokens.spacing.sm }}>
      <View
        style={{
          width: 32, height: 32, borderRadius: tokens.radius.full,
          backgroundColor: colors.primary.subtle,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Feather name={iconName as React.ComponentProps<typeof Feather>['name']} size={15} color={colors.primary.default} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body">{t(i18nKey, i18nParams)}</Text>
        {segments.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
            {segments.map((seg, i) => (
              <View key={i} style={{ flexDirection: 'row' }}>
                {i > 0 && <Text variant="caption" color={colors.text.tertiary}>{'  ›  '}</Text>}
                {seg.linkable ? (
                  <Pressable onPress={() => router.push(seg.route as never)} hitSlop={4}>
                    <Text variant="caption" color={colors.primary.default}>{seg.label}</Text>
                  </Pressable>
                ) : (
                  <Text variant="caption" color={colors.text.tertiary}>{seg.label}</Text>
                )}
              </View>
            ))}
          </View>
        )}
        <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: 2 }}>
          {formatEventTime(event.createdAt)}
        </Text>
      </View>
    </View>
  );
}
