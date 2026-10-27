import { Icon } from '../icon/Icon';
import { Volume2, VolumeX } from '../icon/icons';
import { disableSound, enableSound, useSoundState } from './sound';

/**
 * The sound on/off switch. Muted by default; the choice persists. Turning sound on plays the toggle
 * click as confirmation; turning it off is confirmed by the label alone.
 */
export function SoundToggle({ className = '', corner = false }: { className?: string; corner?: boolean }) {
  const { enabled, unavailable } = useSoundState();
  const control = <>
    <button type="button" className={`ds-sound-toggle ${className}`} aria-label="Interface sounds" aria-pressed={enabled}
      title="Quiet confirmation sounds for your actions" onClick={() => { if (enabled) disableSound(); else void enableSound(); }}>
      <span aria-hidden="true"><Icon icon={enabled ? Volume2 : VolumeX} /></span>Sound {enabled ? 'on' : 'off'}
    </button>
    {unavailable && <span className="ds-sound-message" role="status">Sound unavailable. Continue silently or retry.</span>}
  </>;
  return corner ? <div className="ds-sound-corner">{control}</div> : control;
}
