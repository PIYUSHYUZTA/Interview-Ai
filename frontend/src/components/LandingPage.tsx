import 'lenis/dist/lenis.css';
import '../experience/landing.css';
import { Landing } from '../experience/Landing';

/**
 * The public landing page: the Tree of Thought experience (docs/reference-redesign-spec.md, page 01).
 * Its own module so the screen stays a lazy chunk; it brings the landing's styles with it.
 */
export function LandingPage({ onStart, onWorkspace, signedIn }: { onStart: () => void; onWorkspace: () => void; signedIn: boolean }) {
  return <Landing onStart={onStart} onWorkspace={onWorkspace} signedIn={signedIn} />;
}
