import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

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
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.25)',
    elevation: 8,
  },
  title: {
    color: '#f87171',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    color: '#a0a0b8',
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 19,
  },
  button: {
    backgroundColor: '#1D9E75',
    borderRadius: 22,
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
