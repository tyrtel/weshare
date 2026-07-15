import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ledgerColors } from '../theme/colors';
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
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>{this.state.error.message}</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={this.handleRetry}
              accessibilityLabel="Retry"
              accessibilityRole="button"
            >
              <Text style={styles.buttonLabel}>Retry</Text>
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
    backgroundColor: ledgerColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 24,
    width: '100%',
    shadowColor: '#182420',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    color: ledgerColors.error.default,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    color: ledgerColors.text.secondary,
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 19,
  },
  button: {
    backgroundColor: ledgerColors.primary.default,
    borderRadius: ledgerRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
