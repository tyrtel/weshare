import React, { useEffect } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useService, useTripSessionStore } from '../../core/di/ServiceContext';
import { TRIP_STORE } from '../../core/di/tokens';

const AUTO_DISMISS_MS = 6000;

/** Tells the user a save-first change didn't reach the server and was undone. */
export function WriteErrorBanner() {
  const { t } = useTranslation();
  const storeApi   = useService(TRIP_STORE);
  const writeError = useTripSessionStore(s => s.writeError);

  useEffect(() => {
    if (!writeError) return;
    const timer = setTimeout(() => storeApi.getState().clearWriteError(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [writeError, storeApi]);

  if (!writeError) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => storeApi.getState().clearWriteError()}
      accessibilityRole="alert"
      testID="write-error-banner"
    >
      <Text style={styles.text}>{t('common.write_error_banner')}</Text>
    </Pressable>
  );
}

// Same shape as OfflineBanner; red because something the user did was undone.
const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#dc2626',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
