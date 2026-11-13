import React from 'react';

export default class ViewErrorBoundary extends React.Component {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({failed: false});
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="notice" role="alert">
      This view could not load.{' '}
      <button className="secondary" type="button" onClick={() => this.setState({failed: false})}>Retry view</button>
    </div>;
  }
}
