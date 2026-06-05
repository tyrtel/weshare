import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ServiceProvider, useService } from '../src/core/di/ServiceContext';
import { AUTH } from '../src/core/di/tokens';
import type { User } from '../src/core/models/User';
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

function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useService(AUTH);
  // authReady stays false until onAuthStateChange fires at least once.
  // This prevents a flash to /auth on relaunch when the Supabase session
  // is still being restored from secure storage asynchronously.
  const [user, setUser]           = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const segments  = useSegments();
  const router    = useRouter();
  const navState  = useRootNavigationState();

  useEffect(() => {
    // Resolve the cached session first, then watch for subsequent changes.
    auth.getInitialUser().then(initialUser => {
      setUser(initialUser);
      setAuthReady(true);
    });
    return auth.onAuthStateChange(newUser => setUser(newUser));
  }, [auth]);

  useEffect(() => {
    if (!navState?.key || !authReady) return;
    const inAuthGroup   = segments[0] === 'auth';
    const inPublicGroup = segments[0] === 'auth' || segments[0] === 'join';
    if (!user && !inPublicGroup) {
      router.replace('/auth' as Parameters<typeof router.replace>[0]);
    } else if (user && inAuthGroup) {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }, [user, authReady, segments, router, navState?.key]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ServiceProvider>
          <AuthGate>
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
                <Stack.Screen name="auth/index" options={{ headerShown: false }} />
                <Stack.Screen name="auth/guest" options={{ title: 'Guest', headerBackTitle: '' }} />
                <Stack.Screen name="trip/create" options={{ presentation: 'modal', title: 'New Trip' }} />
                <Stack.Screen name="+not-found" />
              </Stack>
              <UniversalTabBar />
            </View>
          </AuthGate>
        </ServiceProvider>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
