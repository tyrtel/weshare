import { Alert, Platform } from 'react-native';

export function confirm(
  title: string,
  message: string,
  confirmText = 'OK',
  confirmStyle: 'default' | 'destructive' = 'destructive',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: confirmText, style: confirmStyle, onPress: () => resolve(true) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    ]);
  });
}
