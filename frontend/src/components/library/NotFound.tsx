import { Icon } from '../icon/Icon';
import { ArrowRight, House } from '../icon/icons';
import { DsButton } from './buttons';

/**
 * 404, in the product's voice: the page is a question the interviewer never asked. The large numerals
 * are typographic (no illustration file); the faceted ring echoes the brand mark.
 */
export function NotFound({ path, onHome, onWorkspace }: { path: string; onHome: () => void; onWorkspace: () => void }) {
  return <main className="ds-not-found" id="not-found" tabIndex={-1}>
    <div className="ds-not-found-mark" aria-hidden="true"><i /><i /><span>404</span></div>
    <p className="ds-label">PAGE NOT FOUND</p>
    <h1>That question isn’t on the interview.</h1>
    <p className="ds-not-found-copy">There’s nothing at <code className="ds-mono">{path}</code>. It may have moved, or the link may be mistyped. Let’s get you back to practice.</p>
    <div className="ds-cluster ds-not-found-actions">
      <DsButton icon={House} onClick={onHome}>Back to home</DsButton>
      <DsButton variant="secondary" onClick={onWorkspace}>Open your workspace<Icon icon={ArrowRight} /></DsButton>
    </div>
  </main>;
}
