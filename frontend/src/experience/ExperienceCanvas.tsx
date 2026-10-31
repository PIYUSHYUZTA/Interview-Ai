import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { SHOTS } from './chapters';
import { scrollState } from './scroll';
import { tierSettings } from './quality';
import { TreeWorld } from './TreeWorld';

// Palette as light colours (non-UI values; the DOM uses tokens). Strict six colours.
export const PAINT = { ink: 0x031211, charcoal: 0x090907, ivory: 0xe8e4d3, teal: 0x00aebb, amber: 0xb99d73, earth: 0x6c5636 };

/**
 * One spline through every shot's two camera keys (plus a final hold), keyed by continuous chapter progress.
 * Each chapter holds its composition for 70% of its scroll, then flies to the next. Under reduced motion the
 * camera cuts between compositions instead of flying, and does not follow the pointer.
 */
function CameraRig({ still }: { still: boolean }) {
  const camera = useThree((state) => state.camera);
  const { positions, targets, last } = useMemo(() => {
    const keys = SHOTS.flatMap((shot) => shot.keys);
    const final = keys[keys.length - 1];
    const all = [...keys, { position: [final.position[0], final.position[1], final.position[2] + 1.5] as const, target: final.target }];
    return {
      positions: new CatmullRomCurve3(all.map((key) => new Vector3(...key.position)), false, 'centripetal'),
      targets: new CatmullRomCurve3(all.map((key) => new Vector3(...key.target)), false, 'centripetal'),
      last: all.length - 1,
    };
  }, []);
  const goal = useRef({ position: new Vector3(), target: new Vector3(), look: new Vector3(), lean: new Vector3() }).current;
  const first = useRef(true);
  useFrame((state, delta) => {
    const index = Math.min(SHOTS.length - 1, Math.floor(scrollState.chapter)), within = Math.min(1, scrollState.chapter - index);
    const key = still ? index * 2 + .5 : index * 2 + (within < .7 ? within / .7 : 1 + (within - .7) / .3);
    const t = Math.min(1, key / last);
    positions.getPoint(t, goal.position);
    targets.getPoint(t, goal.target);
    // Portrait screens: the shots are composed for wide frames, so centre the tree and stand further back.
    const aspect = (camera as import('three').PerspectiveCamera).aspect;
    if (aspect < 1) { goal.target.x *= .25; goal.position.sub(goal.target).multiplyScalar(1 + (1 - aspect) * .9).add(goal.target); }
    if (!still) goal.position.add(goal.lean.set(state.pointer.x * .45, state.pointer.y * .22, 0));
    if (first.current || still) { camera.position.copy(goal.position); goal.look.copy(goal.target); first.current = false; camera.lookAt(goal.look); return; }
    const lambda = 3.6, step = Math.min(delta, .1);
    camera.position.x = MathUtils.damp(camera.position.x, goal.position.x, lambda, step);
    camera.position.y = MathUtils.damp(camera.position.y, goal.position.y, lambda, step);
    camera.position.z = MathUtils.damp(camera.position.z, goal.position.z, lambda, step);
    goal.look.lerp(goal.target, 1 - Math.exp(-lambda * step));
    camera.lookAt(goal.look);
  });
  return null;
}

/** Under reduced motion the canvas renders on demand: once per scroll chapter change, never continuously. */
function DemandOnScroll() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => { const listener = () => invalidate(); scrollState.listeners.add(listener); return () => { scrollState.listeners.delete(listener); }; }, [invalidate]);
  return null;
}

/** The single, persistent WebGL layer behind the whole landing. Lazy-loaded; never created in the still tier. */
export default function ExperienceCanvas({ tier, still }: { tier: 'high' | 'medium'; still: boolean }) {
  const [effects, setEffects] = useState<boolean>(tierSettings[tier].effects);
  const [dpr, setDpr] = useState(tierSettings[tier].dpr[1]);
  const settings = tierSettings[tier];
  return <Canvas
    className="xp-canvas" aria-hidden="true"
    dpr={[settings.dpr[0], dpr]} frameloop={still ? 'demand' : 'always'}
    gl={{ antialias: settings.antialias, powerPreference: 'high-performance', alpha: false }}
    camera={{ fov: 40, near: .1, far: 200, position: [-4.2, 1.5, 12.5] }}
    onCreated={({ gl }) => gl.setClearColor(PAINT.ink)}
  >
    <PerformanceMonitor onDecline={() => { setEffects(false); setDpr(1); }} flipflops={2} />
    <fog attach="fog" args={[PAINT.ink, 10, 40]} />
    <hemisphereLight args={[PAINT.teal, PAINT.ink, .14]} />
    <directionalLight position={[-8, 10, -6]} intensity={.9} color={PAINT.ivory} />
    <pointLight position={[0, 4.6, 0]} intensity={18} distance={14} color={PAINT.teal} />
    <CameraRig still={still} />
    {still && <DemandOnScroll />}
    <TreeWorld tier={tier} still={still} />
    {effects && <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={.55} luminanceSmoothing={.25} intensity={1.15} radius={.75} />
      <Noise opacity={.03} />
      <Vignette offset={.22} darkness={.8} />
    </EffectComposer>}
  </Canvas>;
}
