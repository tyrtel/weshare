import { ExpoConfig, ConfigContext } from 'expo/config';

const isSimulation = process.env.EXPO_PUBLIC_SIMULATE === 'true';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isSimulation ? 'WeShare (Simulation)' : 'WeShare',
  slug: 'weshare',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.weshare.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.weshare.app',
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-sqlite'],
  extra: {
    // Consumed by ServiceProvider to swap in mock implementations.
    simulation: isSimulation,
  },
});
