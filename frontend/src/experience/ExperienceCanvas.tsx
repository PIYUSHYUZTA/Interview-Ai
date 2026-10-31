import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { CHAPTERS } from './chapters';
import { scrollState } from './scroll';
import { tierSettings } from './quality';
import { PlaceholderWorld } from './PlaceholderWorld';

// Palette as light and material colours (non-UI values; the DOM uses tokens). Strict six colours:
// the retired cerulean and rose roles resolve to teal and amber.
export const PAINT = { jet: 0x031211, ink: 0x031211, charcoal: 0x090907, ivory: 0xe8e4d3, teal: 0x00aebb, cerulean: 0x00aebb, brass: 0xb99d73, earth: 0x6c5636, rose: 0xb99d73 };

/** One spline through every chapter's two camera keys (plus a final hold), keyed by continuous chapter progress. */
function CameraRig() {
  const camera = useThree((state) => state.camera);
  const { positions, targets, last } = useMemo(() => {
    const keys = CHAPTERS.flatMap((chapter) => chapter.keys);
    const final = keys[keys.length - 1];
    const all = [...keys, { position: [final.position[0], final.position[1], final.position[2] - 1.5] as const, target: final.target }];
    return {
      positions: new CatmullRomCurve3(all.map((key) => new Vector3(...key.position)), false, 'centripetal'),
      targets: new CatmullRomCurve3(all.map((key) => new Vector3(...key.target)), false, 'centripetal'),
      last: all.length - 1,
    };
  }, []);
  const goal = useRef({ position: new Vector3(), target: new Vector3(), look: new Vector3(), pointer: new Vector3() }).current;
  const first = useRef(true);
  useFrame((state, delta) => {
    // Hold each chapter's composition for 70% of its scroll (start key → end key), then fly to the next chapter.
    const index = Math.min(CHAPTERS.length - 1, Math.floor(scrollState.chapter)), within = Math.min(1, scrollState.chapter - index);
    const key = index * 2 + (within < .7 ? within / .7 : 1 + (within - .7) / .3);
    const t = Math.min(1, key / last);
    positions.getPoint(t, goal.position);
    targets.getPoint(t, goal.target);
    // A slight lean toward the pointer, like a camera operator's hand.
    goal.pointer.set(state.pointer.x * .35, state.pointer.y * .18, 0);
    goal.position.add(goal.pointer);
    if (first.current) { camera.position.copy(goal.position); goal.look.copy(goal.target); first.current = false; }
    const lambda = 4.5, step = Math.min(delta, .1);
    camera.position.x = MathUtils.damp(camera.position.x, goal.position.x, lambda, step);
    camera.position.y = MathUtils.damp(camera.position.y, goal.position.y, lambda, step);
    camera.position.z = MathUtils.damp(camera.position.z, goal.position.z, lambda, step);
    goal.look.lerp(goal.target, 1 - Math.exp(-lambda * step));
    camera.lookAt(goal.look);
  });
  return null;
}

/** The single, persistent WebGL layer behind the whole landing. Lazy-loaded; never created in the still tier. */
export default function ExperienceCanvas({ tier }: { tier: 'high' | 'medium' }) {
  const [effects, setEffects] = useState<boolean>(tierSettings[tier].effects);
  const [dpr, setDpr] = useState(tierSettings[tier].dpr[1]);
  const settings = tierSettings[tier];
  return <Canvas
    className="xp-canvas" aria-hidden="true"
    dpr={[settings.dpr[0], dpr]}
    gl={{ antialias: settings.antialias, powerPreference: 'high-performance', alpha: false }}
    camera={{ fov: 38, near: .1, far: 160, position: [0, 15, 4] }}
    onCreated={({ gl }) => gl.setClearColor(PAINT.jet)}
  >
    <PerformanceMonitor onDecline={() => { setEffects(false); setDpr(1); }} flipflops={2} />
    <fog attach="fog" args={[PAINT.jet, 14, 46]} />
    <hemisphereLight args={[PAINT.ivory, PAINT.ink, .25]} />
    <directionalLight position={[-6, 9, 4]} intensity={1.6} color={PAINT.brass} />
    <directionalLight position={[5, 4, -8]} intensity={1.1} color={PAINT.teal} />
    {/* Reflections from a studio of light cards built on the GPU: no HDR download. */}
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={2} color={PAINT.brass} position={[-4, 4, 2]} scale={[6, 2, 1]} />
      <Lightformer form="rect" intensity={1.5} color={PAINT.teal} position={[4, 2, -4]} scale={[4, 4, 1]} />
      <Lightformer form="ring" intensity={.6} color={PAINT.ivory} position={[0, 6, 0]} scale={3} />
    </Environment>
    <CameraRig />
    <PlaceholderWorld />
    <Sparkles count={settings.particles} scale={[14, 6, 110]} position={[0, 2.5, -50]} size={2.2} speed={.25} opacity={.5} color={PAINT.ivory} noise={.6} />
    {effects && <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={.85} intensity={.7} />
      <Noise opacity={.035} />
      <Vignette offset={.25} darkness={.75} />
    </EffectComposer>}
  </Canvas>;
}
