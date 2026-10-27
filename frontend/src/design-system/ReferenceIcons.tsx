import { useState } from 'react';
import { BellRingIcon, CheckDrawIcon, Icon, IconButton, MenuToggleIcon, SearchIcon, Spinner } from '../components/icon/Icon';
import { ArrowRight, Brain, FileText, Mic, Target, X } from '../components/icon/icons';

/** The icon system on the reference page: real components, so their behaviour can be checked here. */
export function ReferenceIcons() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searching, setSearching] = useState(true);
  const [checks, setChecks] = useState(0);
  const [rings, setRings] = useState(0);
  return <div className="ds-stack ref-icons">
    <div className="ref-row ref-icon-sizes">
      {(['inline', 'standalone', 'feature'] as const).map((size) => <span key={size} className="ref-icon-size"><Icon icon={Target} size={size} /><code className="ds-mono">{size} · {size === 'inline' ? 16 : size === 'standalone' ? 20 : 24}px</code></span>)}
    </div>
    <div className="ds-cluster">
      <button className="ref-button ref-secondary ref-icon-text"><Icon icon={Mic} />Start microphone</button>
      <button className="ref-button ref-primary ref-icon-text">Start interview<Icon icon={ArrowRight} /></button>
      <span className="ref-icon-text ds-body-sm"><Icon icon={FileText} />Answer evidence</span>
      <IconButton icon={X} label="Close panel" data-testid="icon-button" />
    </div>
    <div className="ref-animations">
      <button className="ref-button ref-secondary ref-icon-text" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} data-testid="menu"><MenuToggleIcon open={menuOpen} />{menuOpen ? 'Close menu' : 'Open menu'}</button>
      <button className="ref-button ref-secondary ref-icon-text" onClick={() => setSearching((s) => !s)} data-testid="search"><SearchIcon loading={searching} />{searching ? 'Analysing résumé…' : 'Search done'}</button>
      <button className="ref-button ref-secondary ref-icon-text" onClick={() => setChecks((n) => n + 1)} data-testid="check"><CheckDrawIcon key={checks} />Step complete (replay)</button>
      <button className="ref-button ref-secondary ref-icon-text" onClick={() => setRings((n) => n + 1)} data-testid="bell"><BellRingIcon ringKey={rings} size="inline" />New warning (ring)</button>
      <span className="ref-icon-text ds-body-sm" role="status"><Spinner size="inline" />Loading your workspace…</span>
      <span className="ref-icon-text ds-body-sm"><Icon icon={Brain} size="feature" label="Interview AI" />Feature mark (labelled)</span>
    </div>
  </div>;
}
