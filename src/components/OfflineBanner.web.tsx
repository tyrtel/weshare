import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function OfflineBanner() {
  const [isConnected, setIsConnected] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

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
