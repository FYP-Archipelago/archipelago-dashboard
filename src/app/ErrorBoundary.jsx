import { Component, Fragment } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, attempt: 0, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error, info) {
    console.error('View failed:', error, info.componentStack);
  }

  render() {
    const { error, attempt } = this.state;
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;
    return (
      <div className="notice error" role="alert">
        This view failed: {error.message || String(error)}{' '}
        <button className="secondary" type="button" onClick={() => this.setState({ error: null, attempt: attempt + 1 })}>
          Retry
        </button>
      </div>
    );
  }
}
