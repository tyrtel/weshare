import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bills', tabBarLabel: 'Bills' }} />
      <Tabs.Screen
        name="participants"
        options={{ title: 'Participants', tabBarLabel: 'People' }}
      />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarLabel: 'Pay' }} />
    </Tabs>
  );
}
