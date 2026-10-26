import type { gsap as GsapInstance } from 'gsap';
import type { ScrollTrigger as ScrollTriggerPlugin } from 'gsap/ScrollTrigger';

type Gsap = { gsap: typeof GsapInstance; ScrollTrigger: typeof ScrollTriggerPlugin };
let loading: Promise<Gsap> | undefined;

/** GSAP + ScrollTrigger in their own lazy chunk: requested only when a scroll scene is near
 * and motion is allowed, so the first render never waits for it. */
export function loadGsap(): Promise<Gsap> {
  loading ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
    gsap.registerPlugin(ScrollTrigger);
    return { gsap, ScrollTrigger };
  });
  return loading;
}
