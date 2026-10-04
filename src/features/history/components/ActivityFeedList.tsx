import React from 'react';
import { View, SectionList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { ActivityFeedItem } from './ActivityFeedItem';
import { groupEventsByDay, formatDaySectionLabel } from '../utils/groupEventsByDay';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { ActivityEvent } from '../../../core/models/ActivityEvent';
import type { Group } from '../../../core/models/Group';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

interface Props {
  events:   ActivityEvent[];
  groups:   Group[];
  trips:    Trip[];
  loading:  boolean;
  hasMore:  boolean;
  loadMore: () => void;
  error:    AppError | null;
}

/** Presentational day-grouped, infinite-scrolling feed — shared by the
 * global History tab and every scoped (group/trip/expense) history screen,
 * which each own their own data fetching and just pass the result in. */
export function ActivityFeedList({ events, groups, trips, loading, hasMore, loadMore, error }: Props) {
  const { t } = useTranslation();
  const colors = useColors();

  if (loading && events.length === 0) return <ScreenWrapper isLoading />;

  const sections = groupEventsByDay(events).map(section => ({
    title: formatDaySectionLabel(section.date, t('common.date_today'), t('common.date_yesterday')),
    data:  section.events,
  }));

  return (
    <ScreenWrapper>
      <SectionList
        sections={sections}
        keyExtractor={(item: ActivityEvent) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: tokens.spacing.md }}>
            <ActivityFeedItem event={item} groups={groups} trips={trips} />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: tokens.spacing.md,
              paddingTop: tokens.spacing.md,
              paddingBottom: tokens.spacing.xs,
              backgroundColor: colors.background,
            }}
          >
            <Text variant="label" color={colors.text.secondary}>{section.title}</Text>
          </View>
        )}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={{ padding: tokens.spacing.lg, alignItems: 'center' }}>
            <Text variant="body" color={colors.text.secondary}>
              {error ? t('history.load_error') : t('history.empty')}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenWrapper>
  );
}
