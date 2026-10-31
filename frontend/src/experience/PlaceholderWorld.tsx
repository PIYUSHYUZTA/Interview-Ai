import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Color, Group, InstancedMesh, MathUtils, Mesh, Object3D, Vector3 } from 'three';
import { ANCHORS, EXAMPLE_SKILLS } from './chapters';
import { scrollState } from './scroll';

/**
 * Phase 1 greybox: one placeholder set per chapter, in final palette materials and at final scale, so the
 * camera paths, pacing and transitions can be judged before the Blender assets (Phases 3–6) replace them.
 */
const P = { jet: 0x031211, ink: 0x031211, charcoal: 0x090907, ivory: 0xe8e4d3, teal: 0x00aebb, cerulean: 0x00aebb, brass: 0xb99d73, earth: 0x6c5636, rose: 0xb99d73 };
const local = (index: number) => MathUtils.clamp(scrollState.chapter - index, 0, 1);
const ease = (t: number) => 1 - (1 - t) ** 3;

function Obsidian() { return <meshPhysicalMaterial color={P.charcoal} roughness={.16} clearcoat={1} clearcoatRoughness={.08} />; }
function Concrete() { return <meshStandardMaterial color={P.ink} roughness={.92} />; }
function Brass() { return <meshStandardMaterial color={P.brass} metalness={1} roughness={.28} />; }
function Glow({ color, strength = 3 }: { color: number; strength?: number }) { return <meshBasicMaterial color={new Color(color).multiplyScalar(strength)} toneMapped={false} />; }

/** 0 · Arrival: a floor plan drawn in light that extrudes into walls as you scroll. */
function Arrival() {
  const walls = useRef<Group>(null);
  const plan = useMemo(() => [
    [0, 0, 9, .08], [0, -4, 9, .08], [-4.5, -2, .08, 4], [4.5, -2, .08, 4], [-1.5, -1.2, .08, 2.4], [1.8, -2.8, .08, 2.4], [0, -2, 3, .08],
  ] as const, []);
  useFrame(() => {
    const t = ease(MathUtils.clamp(scrollState.chapter / .9, 0, 1));
    walls.current?.children.forEach((wall, index) => { wall.scale.y = .02 + t * (2.2 + (index % 3) * .3); wall.position.y = wall.scale.y / 2; });
  });
  return <group position={ANCHORS[0]}>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -2]}><planeGeometry args={[40, 30]} /><Concrete /></mesh>
    <group ref={walls}>{plan.map(([x, z, w, d], index) => <mesh key={index} position={[x, 0, z]}><boxGeometry args={[w, 1, d]} /><Obsidian /></mesh>)}</group>
    {plan.map(([x, z, w, d], index) => <mesh key={`line-${index}`} position={[x, .01, z]} rotation-x={-Math.PI / 2}><planeGeometry args={[Math.max(w, .03), Math.max(d, .03)]} /><Glow color={P.teal} strength={2} /></mesh>)}
  </group>;
}

/** 1 · The Pavilion: an obsidian roof plane floating on brass columns over a stone plinth; light rises inside. */
function Pavilion() {
  const core = useRef<Mesh>(null);
  useFrame((_, delta) => { if (core.current) { core.current.rotation.y += delta * .2; core.current.scale.setScalar(.6 + ease(local(1)) * .5); } });
  const columns = useMemo(() => Array.from({ length: 10 }, (_, index) => [index % 2 ? 4.2 : -4.2, -5 + Math.floor(index / 2) * 2.5] as const), []);
  return <group position={ANCHORS[1]}>
    <mesh position={[0, .2, 0]}><boxGeometry args={[12, .4, 14]} /><Concrete /></mesh>
    <mesh position={[0, 4.6, 0]}><boxGeometry args={[13, .3, 15]} /><Obsidian /></mesh>
    {columns.map(([x, z], index) => <mesh key={index} position={[x, 2.4, z]}><cylinderGeometry args={[.07, .07, 4.2, 16]} /><Brass /></mesh>)}
    <mesh ref={core} position={[2.4, 2, -2]}><icosahedronGeometry args={[.9, 1]} /><meshPhysicalMaterial color={P.teal} emissive={P.teal} emissiveIntensity={.25} roughness={.1} metalness={.2} flatShading /></mesh>
    <mesh position={[0, 2, -6.9]}><planeGeometry args={[3, 4]} /><Glow color={P.teal} strength={.8} /></mesh>
  </group>;
}

/** 2 · The Room: table, two chairs, a seated stand-in for the interviewer, and a skylight. */
function Room() {
  return <group position={ANCHORS[2]}>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[14, 14]} /><Concrete /></mesh>
    <mesh position={[0, .74, 0]}><boxGeometry args={[2.2, .06, 1]} /><Obsidian /></mesh>
    <mesh position={[0, .36, 0]}><boxGeometry args={[.12, .72, .6]} /><Brass /></mesh>
    <mesh position={[0, 1.15, -.9]}><capsuleGeometry args={[.28, .7, 8, 16]} /><meshStandardMaterial color={P.ivory} roughness={.6} /></mesh>
    <mesh position={[0, 1.78, -.9]}><sphereGeometry args={[.17, 32, 16]} /><meshStandardMaterial color={P.ivory} roughness={.5} /></mesh>
    <mesh position={[0, 4, -.4]} rotation-x={Math.PI / 2}><planeGeometry args={[2.6, 1.2]} /><Glow color={P.ivory} strength={1.6} /></mesh>
    <mesh position={[0, 2, -4]}><boxGeometry args={[8, 4, .2]} /><Concrete /></mesh>
  </group>;
}

/** 3 · The Thinking: a cerulean answer line enters the core and branches into teal follow-up paths. */
function Thinking() {
  const paths = useMemo(() => {
    const curve = (points: number[][]) => new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
    return {
      answer: curve([[-6, .6, 3], [-3, 1.4, 1], [0, 2, 0]]),
      branches: [[[0, 2, 0], [2, 3, -1], [4.5, 3.8, -2.5]], [[0, 2, 0], [2.4, 1.6, -1.5], [5, 1.2, -1]], [[0, 2, 0], [1, 3.4, -2.5], [2, 5, -4.5]]].map(curve),
    };
  }, []);
  const growth = useRef<Group>(null);
  useFrame(() => { const t = ease(local(3)); growth.current?.children.forEach((branch, index) => branch.scale.setScalar(MathUtils.clamp(t * 1.6 - index * .2, .001, 1))); });
  return <group position={ANCHORS[3]}>
    <mesh><tubeGeometry args={[paths.answer, 48, .03, 8]} /><Glow color={P.cerulean} strength={2.4} /></mesh>
    <mesh position={[0, 2, 0]}><sphereGeometry args={[.3, 32, 16]} /><Glow color={P.teal} strength={1.1} /></mesh>
    <group ref={growth} position={[0, 0, 0]}>
      {paths.branches.map((path, index) => <group key={index} position={[0, 2, 0]}><mesh position={[0, -2, 0]}><tubeGeometry args={[path, 48, .016, 8]} /><Glow color={P.teal} strength={1.1} /></mesh></group>)}
    </group>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[18, 18]} /><Concrete /></mesh>
  </group>;
}

/** 4 · The Landscape: example skill scores extruded from a floor grid into columns. */
function Landscape() {
  const mesh = useRef<InstancedMesh>(null);
  const cells = useMemo(() => Array.from({ length: 36 }, (_, index) => {
    const skill = EXAMPLE_SKILLS[index % EXAMPLE_SKILLS.length];
    return { x: (index % 6) * 1.3 - 3.25, z: Math.floor(index / 6) * 1.3 - 3.25, height: .3 + skill.score * 3.6 * (.75 + ((index * 37) % 10) / 40) };
  }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const rose = useMemo(() => cells.reduce((best, cell, index) => (cell.height > cells[best].height ? index : best), 0), [cells]);
  useLayoutEffect(() => { cells.forEach((_, index) => mesh.current?.setColorAt(index, new Color(index === rose ? P.rose : P.ivory).multiplyScalar(index === rose ? 1 : .32))); }, [cells, rose]);
  useFrame(() => {
    const t = ease(local(4));
    cells.forEach((cell, index) => {
      const h = .02 + cell.height * MathUtils.clamp(t * 1.4 - (index % 6) * .05, 0, 1);
      dummy.position.set(cell.x, h / 2, cell.z); dummy.scale.set(1, h, 1); dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <group position={ANCHORS[4]}>
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]}><boxGeometry args={[.9, 1, .9]} /><meshPhysicalMaterial roughness={.2} clearcoat={1} /></instancedMesh>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><Concrete /></mesh>
    <gridHelper args={[8, 6, P.earth, P.earth]} position={[0, .01, 0]} />
  </group>;
}

/** 5 · The Drawing Set: three ivory sheets hanging in space. */
function Drawings() {
  const sheets = useRef<Group>(null);
  useFrame((state) => { sheets.current?.children.forEach((sheet, index) => { sheet.rotation.y = -.35 + index * .35 + Math.sin(state.clock.elapsedTime * .3 + index) * .03; }); });
  return <group position={ANCHORS[5]}>
    <group ref={sheets}>{[-1.9, 0, 1.9].map((x, index) => <mesh key={x} position={[x, 1.9 + (index === 1 ? .2 : 0), index === 1 ? .4 : 0]}><planeGeometry args={[1.5, 2.1]} /><meshStandardMaterial color={P.ivory} roughness={.85} side={2} /></mesh>)}</group>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[14, 14]} /><Concrete /></mesh>
  </group>;
}

/** 6 · Daylight: a doorway in a dark wall, filled with teal dawn light; one rose point marks the way. */
function Daylight() {
  return <group position={ANCHORS[6]}>
    <mesh position={[-3.2, 2.5, 0]}><boxGeometry args={[5, 5, .3]} /><Concrete /></mesh>
    <mesh position={[3.2, 2.5, 0]}><boxGeometry args={[5, 5, .3]} /><Concrete /></mesh>
    <mesh position={[0, 4.4, 0]}><boxGeometry args={[1.4, 1.2, .3]} /><Concrete /></mesh>
    <mesh position={[0, 1.9, -.4]}><planeGeometry args={[1.4, 3.8]} /><Glow color={P.teal} strength={1.1} /></mesh>
    <mesh position={[0, .02, 1.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[1.4, 3]} /><Glow color={P.teal} strength={.35} /></mesh>
    <mesh position={[0, 1.9, -.3]}><sphereGeometry args={[.025, 16, 8]} /><Glow color={P.rose} strength={1.6} /></mesh>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><Concrete /></mesh>
  </group>;
}

export function PlaceholderWorld() {
  return <>
    <Arrival /><Pavilion /><Room /><Thinking /><Landscape /><Drawings /><Daylight />
  </>;
}
