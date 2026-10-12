import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCacheExpired } from '../../hooks/useCacheExpired';
import type { CacheBucket } from '../../core/logic/cacheFreshness';

export function SyncBanner({ buckets }: { buckets: readonly CacheBucket[] }) {
  const { t } = useTranslation();
  if (!useCacheExpired(buckets)) return null;

  return (
    <View style={styles.banner} testID="sync-banner">
      <Text style={styles.text}>{t('common.sync_banner')}</Text>
    </View>
  );
}

// Matches OfflineBanner so the two read as the same family of notice.
const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f59e0b',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  text: {
    color: '#1c1917',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
