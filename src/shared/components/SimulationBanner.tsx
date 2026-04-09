import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

/**
 * Renders a full-width amber banner at the top of the screen when the app is
 * running in simulation mode (`EXPO_PUBLIC_SIMULATE=true`).
 * Returns null in production so there is zero render cost.
 */
export function SimulationBanner() {
  const isSimulation = Constants.expoConfig?.extra?.simulation === true;

  if (!isSimulation) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        SIMULATION MODE — in-memory data only, no real payments
      </Text>
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
