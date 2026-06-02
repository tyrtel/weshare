import { ExpoConfig, ConfigContext } from 'expo/config';

const isSimulation = process.env.EXPO_PUBLIC_SIMULATE === 'true';
const isOcrLive    = process.env.EXPO_PUBLIC_OCR_LIVE    === 'true';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isSimulation ? 'ouiShare (Simulation)' : 'ouiShare',
  slug: 'ouishare',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.ouishare.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.ouishare.app',
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  scheme: 'ouishare',
  plugins: ['expo-router', 'expo-sharing', 'expo-sqlite', 'expo-secure-store'],
  extra: {
    // Consumed by ServiceProvider to swap in mock implementations.
    simulation: isSimulation,
    ocrLive: isOcrLive,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
