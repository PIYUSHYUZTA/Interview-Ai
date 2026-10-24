import { Component, type ReactNode } from 'react';
import { Button, Card } from './ui';

/** A failed lazy-loaded screen must show recovery controls, not a blank app. */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Card className="screen-recovery"><div role="alert"><h2>This screen could not be opened.</h2><p>Check your connection and reload the application. Saved interviews and reports remain in your account. Unsaved form edits may need to be entered again.</p></div><Button onClick={() => window.location.reload()}>Reload application</Button></Card>;
    return this.props.children;
  }
}
