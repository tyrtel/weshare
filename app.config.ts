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
    infoPlist: {
      NSCameraUsageDescription: 'ouiShare uses the camera to scan receipts and add expenses faster.',
      NSPhotoLibraryUsageDescription: 'ouiShare reads your photo library to attach receipt images to expenses.',
      NSContactsUsageDescription: 'ouiShare reads your contacts to help you add trip participants by name.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.ouishare.app',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_CONTACTS',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  scheme: 'ouishare',
  plugins: [
    'expo-router',
    'expo-sharing',
    'expo-sqlite',
    'expo-secure-store',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: 'ouiShare reads your photo library to attach receipt images to expenses.',
        cameraPermission: 'ouiShare uses the camera to scan receipts and add expenses faster.',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        // Replace with your Web client ID from Google Cloud Console
        // (OAuth 2.0 client type: Web application — NOT Android/iOS)
        webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? 'REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID',
      },
    ],
  ],
  extra: {
    // Consumed by ServiceProvider to swap in mock implementations.
    simulation: isSimulation,
    ocrLive: isOcrLive,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
