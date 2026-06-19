import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../src/components/ui/Text';
import { darkColors as C } from '../../src/theme/colors';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
        accessibilityLabel="Go back"
      >
        <Text variant="body" color={C.primary.default}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Text variant="heading" style={styles.title}>Reset password</Text>
        <Text variant="body" color={C.text.secondary} style={styles.body}>
          Password reset is coming soon. In the meantime, sign in with Google or Apple if you linked
          those accounts, or contact support.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    gap: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text.primary,
  },
  body: {
    lineHeight: 22,
  },
});
