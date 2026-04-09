import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServiceProvider } from '../src/core/di/ServiceContext';
import { SimulationBanner } from '../src/shared/components/SimulationBanner';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ServiceProvider>
        <SimulationBanner />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </ServiceProvider>
    </SafeAreaProvider>
  );
}
