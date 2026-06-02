import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenListeners={{
        blur: () => {
          if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        },
      }}
      screenOptions={{
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#5a5a7a',
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#2a2a4a',
        },
        headerStyle: { backgroundColor: '#16213e' },
        headerTintColor: '#e8e8f5',
        headerShadowVisible: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trips',
          tabBarLabel: 'Trips',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="airplane-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="balance"
        options={{
          title: 'Summary',
          tabBarLabel: 'Summary',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
