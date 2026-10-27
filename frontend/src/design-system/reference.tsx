// Renders every design token in both themes, built only from the tokens themselves.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './tokens.css';
import './base.css';
import './icons.css';
import './motion.css';
import './sound.css';
import './components.css';
import './reference.css';
import { createRoot } from 'react-dom/client';
import { ReferenceIcons } from './ReferenceIcons';
import { ReferenceMotion } from './ReferenceMotion';
import { ReferenceSound } from './ReferenceSound';

const swatch = (token: string, note = '') => `<figure class="ref-swatch"><span style="background:var(${token})"></span><figcaption><code class="ds-mono">${token}</code>${note ? `<small>${note}</small>` : ''}</figcaption></figure>`;
const textRow = (token: string) => `<p style="color:var(${token})" class="ds-body">${token.replace('--text-', '')} — The interviewer asks one question at a time.</p>`;
const semantic = (name: string) => `<div class="ref-alert" style="background:var(--color-${name}-subtle);border-color:var(--color-${name}-border)"><strong style="color:var(--color-${name})">${name}</strong><span>Recorded as a camera warning for human review.</span></div>`;

const panel = (theme: 'dark' | 'light') => `
<section class="ref-theme" data-theme="${theme}">
  <header class="ref-head"><p class="ds-label">${theme} theme</p><h2 class="ds-h2">Minimal Precision</h2></header>

  <p class="ds-label">Brand</p>
  <div class="ref-row">${swatch('--color-primary', 'Electric Teal')}${swatch('--color-primary-hover')}${swatch('--color-primary-subtle')}${swatch('--color-accent', 'Burnt Amber')}${swatch('--color-accent-subtle')}</div>
  <div class="ds-cluster"><button class="ref-button ref-primary">Start interview</button><button class="ref-button ref-secondary">Practice plan</button><span class="ref-accent">Accent highlight</span><span class="ref-link">Primary link</span></div>

  <p class="ds-label">Backgrounds</p>
  <div class="ref-layers"><div style="background:var(--bg-base)">base<div style="background:var(--bg-surface)">surface<div style="background:var(--bg-elevated);box-shadow:var(--shadow-md)">elevated<div style="background:var(--bg-overlay);box-shadow:var(--shadow-lg)">overlay</div></div></div></div></div>

  <p class="ds-label">Text</p>
  <div class="ds-stack" style="--stack-gap:var(--space-1)">${['--text-primary', '--text-secondary', '--text-muted', '--text-disabled'].map(textRow).join('')}</div>

  <p class="ds-label">Semantic</p>
  <div class="ds-stack" style="--stack-gap:var(--space-2)">${['success', 'warning', 'error', 'info'].map(semantic).join('')}</div>

  <p class="ds-label">Type scale · Geist / Geist Mono</p>
  <div class="ref-type">
    <p class="ds-display">72·60 Display</p><p class="ds-h1">48 Heading one</p><p class="ds-h2">32 Heading two</p><p class="ds-h3">24 Heading three</p><p class="ds-h4">20 Heading four</p>
    <p class="ds-body-lg">18 Body large, relaxed leading for reading answers and feedback.</p><p class="ds-body">16 Body, the default for interface copy.</p><p class="ds-body-sm">14 Body small for dense panels.</p>
    <p class="ds-caption">12 Caption</p><p class="ds-label">12 Label · uppercase · 0.08em</p><p class="ds-mono ds-body">02:47 · 1 / 2 warnings · yaw −7° · score 83</p>
  </div>

  <p class="ds-label">Space · 4pt grid</p>
  <div class="ref-space">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((n) => `<span><i style="width:var(--space-${n})"></i><code class="ds-mono">${n * 4}</code></span>`).join('')}</div>

  <p class="ds-label">Icons · Lucide · 1.5px stroke</p>
  <div class="ref-icon-mount"></div>

  <p class="ds-label">Radius · Shadow</p>
  <div class="ref-row">${['xs', 'sm', 'md', 'lg', 'xl', 'full'].map((r) => `<span class="ref-shape" style="border-radius:var(--radius-${r})"><code class="ds-mono">${r}</code></span>`).join('')}</div>
  <div class="ref-row">${['xs', 'sm', 'md', 'lg', 'brand'].map((s) => `<span class="ref-shape ref-shadow" style="box-shadow:var(--shadow-${s})"><code class="ds-mono">${s}</code></span>`).join('')}</div>
</section>`;

document.querySelector('#reference')!.innerHTML = `
<div class="ds-container ref-page">
  <header class="ref-intro"><p class="ds-label">Interview AI · design system</p><h1 class="ds-h1">Tokens</h1>
    <p class="ds-body-lg" style="color:var(--text-secondary)">Every value on this page comes from <code class="ds-mono">tokens.css</code>. Grid: <span class="ds-mono" id="cols"></span> columns at this width.</p></header>
  <div class="ds-grid ref-grid"><div style="--span-desktop:6">${panel('dark')}</div><div style="--span-desktop:6">${panel('light')}</div></div>
  <section class="ref-theme ref-motion-panel" data-theme="dark"><header class="ref-head"><p class="ds-label">Motion</p><h2 class="ds-h2">Purposeful, once</h2></header><div class="ref-motion-mount"></div></section>
  <section class="ref-theme ref-motion-panel" data-theme="dark"><header class="ref-head"><p class="ds-label">Sound</p><h2 class="ds-h2">Confirms, never decorates</h2></header><div class="ref-sound-mount"></div></section>
</div>`;
document.querySelectorAll('.ref-icon-mount').forEach((mount) => createRoot(mount).render(<ReferenceIcons />));
createRoot(document.querySelector('.ref-motion-mount')!).render(<ReferenceMotion />);
createRoot(document.querySelector('.ref-sound-mount')!).render(<ReferenceSound />);
document.querySelector('#cols')!.textContent = getComputedStyle(document.documentElement).getPropertyValue('--grid-columns').trim();
