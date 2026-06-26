import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('common.not_found_title') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.not_found_body')}</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{t('common.go_to_home')}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827' },
  link: { marginTop: 16, paddingVertical: 12 },
  linkText: { fontSize: 14, color: '#2563eb' },
});
