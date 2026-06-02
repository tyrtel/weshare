import React from 'react';
import { Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

type Props = {
  onImageCaptured: (imageBase64: string, mimeType: 'image/jpeg' | 'image/png') => void;
  disabled?: boolean;
};

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  quality: 0.7,
  base64: true,
  // Resize to max 1024px on the longest edge before encoding — keeps
  // the base64 payload around 150 KB instead of the raw 3–5 MB.
  exif: false,
};

export function ReceiptCameraButton({ onImageCaptured, disabled = false }: Props) {
  const colors = useColors();

  async function launchCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access required', 'Please enable camera access in Settings to scan receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    handleResult(result);
  }

  async function launchLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
    handleResult(result);
  }

  function handleResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) return;
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    onImageCaptured(asset.base64, mimeType);
  }

  function handlePress() {
    // On web, Alert.alert with multiple buttons renders as a plain browser alert
    // with no button choices. Go straight to the file picker instead.
    if (Platform.OS === 'web') {
      void launchLibrary();
      return;
    }
    Alert.alert('Add Receipt', 'Choose a source', [
      { text: 'Take Photo',    onPress: () => void launchCamera() },
      { text: 'Photo Library', onPress: () => void launchLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Scan receipt"
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: tokens.radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {disabled
        ? <ActivityIndicator size="small" color={colors.primary.default} />
        : <Ionicons name="camera-outline" size={20} color={colors.primary.default} />
      }
    </Pressable>
  );
}
