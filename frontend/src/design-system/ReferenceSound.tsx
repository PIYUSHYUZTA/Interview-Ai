import { playSound, type Cue } from '../components/sound/sound';
import { SoundToggle } from '../components/sound/SoundToggle';
import { recipes } from './sound';

const where: Record<Cue, string> = {
  click: 'Every button press', success: 'Account created / signed in', error: 'Sign-in rejected (with the shake)',
  notify: 'A toast appears', modalOpen: 'A dialog opens', modalClose: 'A dialog closes', toggle: 'Sound on, filters, pressed buttons',
  page: 'Screen change', copy: 'Copy to clipboard (no copy action in the product yet)', remove: 'A notification is dismissed',
  done: 'An interview is completed',
};

/** Every cue on one panel, so each can be heard and compared. Sound is off until switched on here. */
export function ReferenceSound() {
  return <div className="ds-stack ref-sound">
    <SoundToggle />
    <div className="ref-sound-grid">{(Object.keys(recipes) as Cue[]).map((cue) => <button key={cue} type="button" className="ref-button ref-secondary" onClick={() => playSound(cue)} data-cue={cue}>
      <strong className="ds-mono">{cue}</strong><small>{where[cue]}</small>
    </button>)}</div>
  </div>;
}
