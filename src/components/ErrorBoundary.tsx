import React from 'react';
import { View, Text, Pressable, StyleSheet, Appearance } from 'react-native';
import { getColors } from '../theme/colors';
import { ledgerRadius } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  retry?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.retry?.();
  };

  render() {
    if (this.state.error) {
      const colors = getColors(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.text.primary }]}>
            <Text style={[styles.title, { color: colors.error.default }]}>Something went wrong</Text>
            <Text style={[styles.message, { color: colors.text.secondary }]}>{this.state.error.message}</Text>
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.primary.default }, pressed && styles.buttonPressed]}
              onPress={this.handleRetry}
              accessibilityLabel="Retry"
              accessibilityRole="button"
            >
              <Text style={[styles.buttonLabel, { color: colors.text.inverse }]}>Retry</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: ledgerRadius.card,
    padding: 24,
    width: '100%',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 19,
  },
  button: {
    borderRadius: ledgerRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
