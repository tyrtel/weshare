import '../src/i18n'; // initialise i18next before any component renders
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { View, Text, ScrollView, Appearance } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ServiceProvider, useService } from '../src/core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../src/core/di/tokens';
import type { User } from '../src/core/models/User';
import { AppLoadingScreen } from '../src/components/ui/AppLoadingScreen';
import { SimulationBanner } from '../src/shared/components/SimulationBanner';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { UniversalTabBar } from '../src/components/ui/UniversalTabBar';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { useColors, getColors } from '../src/theme/colors';
import { useResolvedTheme } from '../src/store/themeStore';
import { useRegisterPushToken } from '../src/features/notifications/hooks/useRegisterPushToken';
import { confirm } from '../src/core/utils/confirm';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

type StartupPhase = 'auth' | 'trips' | 'ready';

Sentry.init({
  dsn: 'https://5c63985ffb6bc5579bf90a309a290164@o4511608333664256.ingest.de.sentry.io/4511608346771536',
  enabled: !__DEV__,
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
});

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
      const colors = getColors(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 60 }}>
          <Text style={{ color: colors.error.default, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
            {i18next.t('common.render_error')}
          </Text>
          <ScrollView>
            <Text style={{ color: colors.error.default, fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.error.message}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 16, fontFamily: 'monospace' }}>
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
  const { t } = useTranslation();
  const auth     = useService(AUTH);
  const storeApi = useService(TRIP_STORE);

  const [user, setUser]       = useState<User | null>(null);
  const [phase, setPhase]     = useState<StartupPhase>('auth');
  const [slowAuth, setSlowAuth] = useState(false);
  const segments    = useSegments();
  const router      = useRouter();
  const navState    = useRootNavigationState();
  const didResetRef = useRef(false);

  useRegisterPushToken();

  // Sequential startup: auth rehydration first, then initial trips load.
  // Nothing in the app renders until both phases complete — PostgREST only
  // ever receives one request at a time, preventing the cold-start starvation
  // that caused the restart hang.
  useEffect(() => {
    let cancelled = false;

    async function startup() {
      // ── Phase 1: auth rehydration ──────────────────────────────────────────
      const initialUser = await auth.getInitialUser();
      if (cancelled || didResetRef.current) return;
      setUser(initialUser);

      if (!initialUser) {
        setPhase('ready');
        return;
      }

      // ── Phase 2: initial trips load ────────────────────────────────────────
      setPhase('trips');
      Sentry.addBreadcrumb({ category: 'startup', message: 'startup_trips_start', level: 'info' });
      try {
        await withTimeout(storeApi.getState().loadTrips(initialUser.id), 20_000);
      } catch {
        // The abandoned first request warms the cold PostgREST connection on
        // the server side. An immediate retry almost always succeeds in < 2 s.
        Sentry.captureMessage('startup_trips_timeout_retrying', 'warning');
        try {
          await withTimeout(storeApi.getState().loadTrips(initialUser.id), 20_000);
        } catch {
          Sentry.captureMessage('startup_trips_timeout', 'warning');
          // Both timed out — proceed anyway; useTrips.refetch (pull-to-refresh) is the recovery path.
        }
      }

      if (!cancelled && !didResetRef.current) {
        const trips = storeApi.getState().trips;
        await Promise.all([
          ...trips.map(t => storeApi.getState().loadTripDetail(t.id)),
          storeApi.getState().loadGroups(initialUser.id),
        ]).catch(() => {});
        Sentry.addBreadcrumb({
          category: 'startup',
          message:  `startup_trips_done: count=${storeApi.getState().trips.length} err=${!!storeApi.getState().hydrationError}`,
          level:    'info',
        });
        setPhase('ready');
      }
    }

    startup();
    return () => { cancelled = true; };
  }, [auth, storeApi]);

  // Post-startup auth changes: sign-out, new sign-in from auth screen, token refresh
  useEffect(() => {
    const unsub = auth.onAuthStateChange(newUser => setUser(newUser));
    return unsub;
  }, [auth]);

  // Show "Connecting to server…" if auth phase takes unusually long (cold GoTrue)
  useEffect(() => {
    if (phase !== 'auth') return;
    const t = setTimeout(() => setSlowAuth(true), 8_000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    Sentry.setUser(user ? { id: user.id } : null);
  }, [user]);

  useEffect(() => {
    if (phase !== 'ready' || !navState?.key) return;
    const inAuthGroup   = segments[0] === 'auth';
    const inPublicGroup = segments[0] === 'auth' || segments[0] === 'join';
    if (!user && !inPublicGroup) {
      router.replace('/auth' as Parameters<typeof router.replace>[0]);
    } else if (user && inAuthGroup) {
      router.replace('/' as Parameters<typeof router.replace>[0]);
    }
  }, [user, phase, segments, router, navState?.key]);

  const handleDebugReset = useCallback(() => {
    void confirm(t('common.debug.reset_auth_title'), t('common.debug.reset_auth_message'), t('common.debug.clear_and_sign_out')).then(async confirmed => {
      if (!confirmed) return;
      Sentry.captureMessage('debug_reset_auth_triggered', 'info');
      didResetRef.current = true;
      await auth.debugSignOut().catch(() => {});
      setUser(null);
      setPhase('ready');
    });
  }, [auth, t]);

  if (phase !== 'ready') {
    const message = phase === 'trips'
      ? t('common.loading')
      : slowAuth ? t('common.connecting_to_server') : undefined;
    return (
      <AppLoadingScreen
        message={message}
        onDebugReset={handleDebugReset}
      />
    );
  }

  return <>{children}</>;
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-SemiBold': SpaceGrotesk_600SemiBold,
    'SpaceGrotesk-Bold': SpaceGrotesk_700Bold,
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });
  const colors = useColors();
  const resolvedTheme = useResolvedTheme();

  if (!fontsLoaded) return <AppLoadingScreen />;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ServiceProvider>
          <AuthGate>
            <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
            <SimulationBanner />
            <OfflineBanner />
            <View style={{ flex: 1 }}>
              <Stack
                style={{ flex: 1 }}
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface },
                  headerTintColor: colors.text.primary,
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
                <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="trip/create" options={{ presentation: 'modal', title: 'New Trip' }} />
                <Stack.Screen name="trip/edit" options={{ presentation: 'modal', title: 'Edit Trip' }} />
                <Stack.Screen name="expense/add" options={{ presentation: 'modal', title: 'New Expense' }} />
                <Stack.Screen name="expense/edit" options={{ presentation: 'modal', title: 'Edit Expense' }} />
                <Stack.Screen name="group/create" options={{ presentation: 'modal', title: 'New Group' }} />
                <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
                <Stack.Screen name="group/edit" options={{ presentation: 'modal', title: 'Edit Group' }} />
                <Stack.Screen name="group/add-member" options={{ title: 'Add Member' }} />
                <Stack.Screen name="group/expense/add" options={{ presentation: 'modal', title: 'New Expense' }} />
                <Stack.Screen name="group/expense/[id]" options={{ title: 'Expense' }} />
                <Stack.Screen name="group/settle/[id]" options={{ title: 'Settle up' }} />
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
});
