import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServiceProvider } from '../src/core/di/ServiceContext';
import { SimulationBanner } from '../src/shared/components/SimulationBanner';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { UniversalTabBar } from '../src/components/ui/UniversalTabBar';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#1a1a2e', padding: 24, paddingTop: 60 }}>
          <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
            Render Error
          </Text>
          <ScrollView>
            <Text style={{ color: '#f87171', fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.error.message}
            </Text>
            <Text style={{ color: '#5a5a7a', fontSize: 11, marginTop: 16, fontFamily: 'monospace' }}>
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ServiceProvider>
          <SimulationBanner />
          <OfflineBanner />
          <View style={{ flex: 1 }}>
            <Stack
              style={{ flex: 1 }}
              screenOptions={{
                headerStyle: { backgroundColor: '#16213e' },
                headerTintColor: '#e8e8f5',
                headerShadowVisible: false,
                headerBackTitle: '',
              }}
              screenListeners={{
                blur: () => {
                  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="trip/create" options={{ presentation: 'modal', title: 'New Trip' }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <UniversalTabBar />
          </View>
        </ServiceProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
