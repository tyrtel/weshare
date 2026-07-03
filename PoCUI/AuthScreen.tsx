import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, AntDesign } from '@expo/vector-icons';
import { palette, type, radius, space } from '../theme';

export default function AuthScreen({ navigation }: any) {
  const [email, setEmail] = useState('');

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, padding: space(6), justifyContent: 'space-between' }}
      >
        {/* Wordmark + pitch */}
        <View style={{ marginTop: space(10) }}>
          <View style={styles.mark}>
            <View style={[styles.markHalf, { backgroundColor: palette.owes }]} />
            <View style={styles.markSpine} />
            <View style={[styles.markHalf, { backgroundColor: palette.owed }]} />
          </View>
          <Text style={styles.title}>Even</Text>
          <Text style={styles.tagline}>
            Trips, rent, dinners — split anything,{'\n'}settle everything.
          </Text>
        </View>

        {/* Sign-in options */}
        <View style={{ gap: space(3) }}>
          <Pressable style={[styles.provider, { backgroundColor: palette.ink }]}>
            <AntDesign name="apple1" size={18} color="#fff" />
            <Text style={[styles.providerLabel, { color: '#fff' }]}>Continue with Apple</Text>
          </Pressable>

          <Pressable style={[styles.provider, styles.providerLight]}>
            <AntDesign name="google" size={18} color={palette.ink} />
            <Text style={styles.providerLabel}>Continue with Google</Text>
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} /><Text style={styles.or}>or</Text><View style={styles.orLine} />
          </View>

          <View style={styles.emailRow}>
            <Feather name="mail" size={17} color={palette.inkFaint} />
            <TextInput
              style={styles.emailInput}
              placeholder="you@example.com"
              placeholderTextColor={palette.inkFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable
              style={[styles.go, { opacity: email.includes('@') ? 1 : 0.35 }]}
              onPress={() => navigation.replace('Home')}
            >
              <Feather name="arrow-right" size={18} color="#fff" />
            </Pressable>
          </View>

          <Text style={styles.legal}>
            We'll email you a sign-in link. No password to remember.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.mist },
  mark: { flexDirection: 'row', alignItems: 'center', marginBottom: space(5) },
  markHalf: { width: 26, height: 12, borderRadius: 6 },
  markSpine: { width: 3, height: 24, backgroundColor: palette.ink, marginHorizontal: 5, borderRadius: 2 },
  title: { fontFamily: type.display, fontSize: 44, color: palette.ink, letterSpacing: -1.5 },
  tagline: { fontFamily: type.body, fontSize: 16, lineHeight: 24, color: palette.inkSoft, marginTop: space(2) },
  provider: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: radius.md,
  },
  providerLight: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.lineStrong },
  providerLabel: { fontFamily: type.bodySemi, fontSize: 15, color: palette.ink },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: space(1) },
  orLine: { flex: 1, height: 1, backgroundColor: palette.line },
  or: { fontFamily: type.body, fontSize: 12, color: palette.inkFaint },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.paper, borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.lineStrong,
    paddingLeft: 14, paddingRight: 6, height: 54,
  },
  emailInput: { flex: 1, fontFamily: type.body, fontSize: 15, color: palette.ink },
  go: {
    width: 42, height: 42, borderRadius: radius.sm,
    backgroundColor: palette.spruce, alignItems: 'center', justifyContent: 'center',
  },
  legal: { fontFamily: type.body, fontSize: 12, color: palette.inkFaint, textAlign: 'center', marginTop: space(1) },
});
