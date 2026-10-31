import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferGeometry, Color, Float32BufferAttribute, Group, Vector3 } from 'three';

/**
 * "Your thinking, mapped" (report reference: the wireframe neural network in a brain silhouette).
 * A procedural brain-shaped point network forms the backdrop; the bright nodes are the candidate's real
 * answers, grouped into one region per skill: teal where the answer met the bar, amber where it fell short,
 * sized by score. Decorative for assistive technology: the same data is the histogram and table beside it.
 */
export type MapAnswer = { id: string; skillId: string; score: number };
type Props = { answers: MapAnswer[]; active: string | null; onActive: (id: string | null) => void; still: boolean; dense: boolean };

const INK = 0x031211, TEAL = 0x00aebb, AMBER = 0xb99d73, IVORY = 0xe8e4d3;
const MEETS = 6; // an answer scored 6/10 or more met the bar

function random(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

/** Points inside two hemispheres, a cerebellum and a stem; most of them near the surface, like a wireframe. */
/** Keeps the whole brain (about 3.4 × 2.8 units in profile) in frame whatever the panel's shape. */
function FitCamera() {
  const { camera, size } = useThree();
  useFrame(() => {
    const perspective = camera as import('three').PerspectiveCamera, aspect = size.width / Math.max(1, size.height);
    const half = Math.tan((perspective.fov * Math.PI) / 360);
    const distance = Math.max(1.5 / half, 1.8 / (half * aspect)) + .3;
    if (Math.abs(perspective.position.z - distance) > .01) { perspective.position.set(0, .1, distance); perspective.lookAt(0, -.05, 0); }
  });
  return null;
}

function brainCloud(count: number) {
  const next = random(11), points: Vector3[] = [];
  const inside = (p: Vector3, c: Vector3, r: Vector3) => ((p.x - c.x) / r.x) ** 2 + ((p.y - c.y) / r.y) ** 2 + ((p.z - c.z) / r.z) ** 2;
  const hemispheres = [new Vector3(-.52, .1, 0), new Vector3(.52, .1, 0)], lobe = new Vector3(.98, .82, 1.28);
  const cerebellum = new Vector3(0, -.62, -.86), little = new Vector3(.66, .32, .42);
  while (points.length < count) {
    const p = new Vector3(next() * 3.2 - 1.6, next() * 2.6 - 1.6, next() * 3 - 1.5);
    const d = Math.min(...hemispheres.map((c) => inside(p, c, lobe)));
    const shell = d <= 1 && (d > .72 || next() < .12);
    const back = inside(p, cerebellum, little) <= 1 && next() < .5;
    const stem = Math.hypot(p.x, p.z + .42) < .16 && p.y < -.5 && p.y > -1.5 && next() < .35;
    if (shell || back || stem) points.push(p);
  }
  return points;
}

/** Follows the page theme (it can change while the report is open): the backdrop dots are ink on light surfaces. */
function useLightTheme() {
  const read = () => document.documentElement.dataset.theme === 'light';
  const [light, setLight] = useState(read);
  useEffect(() => { const observer = new MutationObserver(() => setLight(read())); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => observer.disconnect(); }, []);
  return light;
}

function Network({ answers, active, onActive, still, dense }: Props) {
  const light = useLightTheme();
  const group = useRef<Group>(null);
  const { cloud, links, nodes, skillLinks } = useMemo(() => {
    const cloudPoints = brainCloud(dense ? 1400 : 700);
    const cloud = new BufferGeometry().setFromPoints(cloudPoints);
    // Each point links to its two nearest neighbours (within a sample) to draw the wireframe.
    const sample = cloudPoints.slice(0, dense ? 650 : 360), segments: number[] = [];
    sample.forEach((p, i) => {
      const nearest = sample.map((q, j) => ({ j, d: i === j ? Infinity : p.distanceToSquared(q) })).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const { j, d } of nearest) if (d < .05) segments.push(p.x, p.y, p.z, sample[j].x, sample[j].y, sample[j].z);
    });
    const links = new BufferGeometry(); links.setAttribute('position', new Float32BufferAttribute(segments, 3));
    // One region per skill, spread over the upper surface with the golden angle.
    const skills = [...new Set(answers.map((a) => a.skillId))];
    const anchors = new Map(skills.map((id, i) => {
      const t = (i + .5) / Math.max(1, skills.length), angle = i * 2.39996;
      const side = Math.cos(angle) >= 0 ? .52 : -.52;
      return [id, new Vector3(side + Math.cos(angle) * .55, .25 + (1 - t) * .55, Math.sin(angle) * .95)];
    }));
    const jitter = random(97);
    const nodes = answers.map((a) => ({ ...a, position: anchors.get(a.skillId)!.clone().add(new Vector3(jitter() - .5, jitter() - .5, jitter() - .5).multiplyScalar(.34)) }));
    const pairs: number[] = [];
    for (const id of skills) {
      const same = nodes.filter((n) => n.skillId === id);
      same.slice(1).forEach((n, i) => pairs.push(same[i].position.x, same[i].position.y, same[i].position.z, n.position.x, n.position.y, n.position.z));
    }
    const skillLinks = new BufferGeometry(); skillLinks.setAttribute('position', new Float32BufferAttribute(pairs, 3));
    return { cloud, links, nodes, skillLinks };
  }, [answers, dense]);
  // A side profile, like the reference, that sways gently rather than spinning (static under reduced motion).
  useFrame((state) => { if (group.current && !still) group.current.rotation.y = -1.3 + Math.sin(state.clock.elapsedTime * .25) * .35; });
  const glow = (hex: number, strength: number) => new Color(hex).multiplyScalar(strength);
  return <group ref={group} rotation={[.05, -1.3, 0]} position={[0, .2, 0]}>
    <points geometry={cloud}><pointsMaterial size={.022} color={light ? INK : IVORY} transparent opacity={light ? .45 : .55} sizeAttenuation depthWrite={false} /></points>
    <lineSegments geometry={links}><lineBasicMaterial color={TEAL} transparent opacity={light ? .38 : .22} depthWrite={false} /></lineSegments>
    <lineSegments geometry={skillLinks}><lineBasicMaterial color={TEAL} transparent opacity={.55} depthWrite={false} /></lineSegments>
    {nodes.map((n) => {
      const on = active === n.id, meets = n.score >= MEETS;
      return <mesh key={n.id} position={n.position} scale={on ? 1.7 : 1}
        onPointerOver={(event) => { event.stopPropagation(); onActive(n.id); }} onPointerOut={() => onActive(null)}>
        <sphereGeometry args={[.035 + n.score * .006, 20, 12]} />
        <meshBasicMaterial color={glow(meets ? TEAL : AMBER, on ? 2.2 : 1.3)} toneMapped={false} />
      </mesh>;
    })}
  </group>;
}

export default function ReportNeuralMap(props: Props) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return <Canvas className="rp-map-canvas" aria-hidden="true" dpr={[1, props.dense ? 1.75 : 1.25]} frameloop={props.still ? 'demand' : 'always'}
    camera={{ fov: 34, position: [0, .1, 5.6], near: .1, far: 20 }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearColor(INK, 0)}>
    <FitCamera />
    <Network {...props} />
    {/* Drag to turn the map (mouse only, so touch still scrolls the page); no zoom or pan. */}
    {!coarse && <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI * .3} maxPolarAngle={Math.PI * .7} rotateSpeed={.5} />}
  </Canvas>;
}
