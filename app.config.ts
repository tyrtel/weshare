import { ExpoConfig, ConfigContext } from 'expo/config';

const isSimulation = process.env.EXPO_PUBLIC_SIMULATE === 'true';
const isQaUnlock = process.env.EXPO_PUBLIC_QA_UNLOCK === 'true';

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
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: '#F2EDE4',
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
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'react-native',
        organization: 'mccleery-enterprises',
      },
    ],
    'expo-router',
    'expo-sharing',
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
        // Web client ID from Google Cloud Console (OAuth 2.0 → Web application).
        // Set GOOGLE_WEB_CLIENT_ID as an EAS secret for production builds.
        // Set GOOGLE_IOS_URL_SCHEME when adding iOS support (reversed iOS client ID).
        webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
        // iosUrlScheme = reversed iOS OAuth client ID from Google Cloud Console.
        // Replace GOOGLE_IOS_URL_SCHEME EAS secret when adding iOS support.
        iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.placeholder',
      },
    ],
    'expo-notifications',
  ],
  extra: {
    // Consumed by ServiceProvider to swap in mock implementations.
    simulation: isSimulation,
    // Consumed by RevenueCatEntitlementService to bypass every paywall gate
    // without touching RevenueCat. Only set on development/debug-device/preview
    // build profiles in eas.json — never on production.
    qaUnlock: isQaUnlock,
    privacyPolicyUrl: 'https://tyrtel.github.io/ouishare-legal/',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId:   process.env.GOOGLE_WEB_CLIENT_ID   ?? '',
    googleIosUrlScheme:  process.env.GOOGLE_IOS_URL_SCHEME  ?? 'com.googleusercontent.apps.placeholder',
    revenueCatIosApiKey:     process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY     ?? '',
    revenueCatAndroidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
    eas: {
      projectId: 'a1b9adb5-735f-46c6-9457-e4161f0eee99',
    },
  },
});
