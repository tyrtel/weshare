import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';

export const TAB_BAR_HEIGHT = 56;

const ACTIVE_TINT   = '#1D9E75';
const INACTIVE_TINT = '#5a5a7a';
const BG_COLOR      = '#16213e';
const BORDER_COLOR  = '#2a2a4a';

interface TabDef {
  label: string;
  icon:  React.ComponentProps<typeof Ionicons>['name'];
  route: string;
  isActive: (pathname: string) => boolean;
}

const TABS: TabDef[] = [
  {
    label:    'Trips',
    icon:     'airplane-outline',
    route:    '/',
    isActive: (p) => p !== '/balance' && !p.startsWith('/settle'),
  },
  {
    label:    'Balance',
    icon:     'wallet-outline',
    route:    '/balance',
    isActive: (p) => p === '/balance' || p.startsWith('/settle'),
  },
];

export function UniversalTabBar() {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  if (pathname.startsWith('/auth') || pathname.startsWith('/join')) return null;

  return (
    <View
      style={{
        flexDirection:   'row',
        backgroundColor: BG_COLOR,
        borderTopWidth:  1,
        borderTopColor:  BORDER_COLOR,
        height:          TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom:   insets.bottom,
      }}
    >
      {TABS.map((tab) => {
        const active = tab.isActive(pathname);
        const tint   = active ? ACTIVE_TINT : INACTIVE_TINT;
        return (
          <Pressable
            key={tab.route}
            onPress={() => router.push(tab.route as Parameters<typeof router.push>[0])}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            style={({ pressed }) => ({
              flex:           1,
              alignItems:     'center',
              justifyContent: 'center',
              gap:            2,
              opacity:        pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name={tab.icon} size={22} color={tint} />
            <Text variant="caption" color={tint} style={{ fontSize: 11 }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
