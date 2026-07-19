import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught error:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>NextInvoice hit an error</Text>
            <Text style={styles.message}>{String(this.state.error?.message || this.state.error)}</Text>
            {this.state.error?.stack ? <Text style={styles.stack}>{String(this.state.error.stack)}</Text> : null}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  content: {
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  stack: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
