import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '../design-system/tokens.css';
import '../design-system/base.css';
import '../design-system/a11y.css';
import 'lenis/dist/lenis.css';
import './experience.css';
import { Experience } from './Experience';

createRoot(document.getElementById('experience')!).render(<StrictMode><Experience /></StrictMode>);
