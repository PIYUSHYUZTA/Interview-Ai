import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BackSide, CatmullRomCurve3, DoubleSide, Color, InstancedMesh, MathUtils, Matrix4, Object3D, Quaternion, ShaderMaterial, TubeGeometry, Vector3 } from 'three';
import { scrollState } from './scroll';

/**
 * The landing's world, after the mindhyve reference: a luminous tree on a small island in still water, in a
 * night forest, with drifting fireflies. Here it is the "Tree of Thought": roots for your résumé, the trunk for
 * the conversation, branches for the follow-up questions that grow from each answer, the canopy for the report.
 * Everything reacts to the scroll chapter (scrollState.chapter): roots light up, a pulse climbs the branches,
 * the canopy turns into teal and amber "evidence", and a path of light leads back down to the viewer.
 */
const P = { ink: 0x031211, charcoal: 0x090907, ivory: 0xe8e4d3, teal: 0x00aebb, amber: 0xb99d73, earth: 0x6c5636 };
const near = (chapter: number, width = .9) => Math.max(0, 1 - Math.abs(scrollState.chapter - chapter - .45) / width);

function random(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

type Segment = { start: Vector3; end: Vector3; radius: number; depth: number };
/** A wide, bonsai-like crown: each branch splits into two or three, spreading outward and slightly up. */
function growTree() {
  const next = random(23), segments: Segment[] = [], tips: Vector3[] = [];
  const grow = (start: Vector3, dir: Vector3, length: number, radius: number, depth: number) => {
    const end = start.clone().addScaledVector(dir, length);
    segments.push({ start, end, radius, depth });
    if (depth >= 6) { tips.push(end); return; }
    const children = depth < 1 ? 2 : next() < .55 ? 2 : 3;
    for (let i = 0; i < children; i++) {
      const axis = new Vector3(next() - .5, 0, next() - .5).normalize();
      const spread = (depth < 2 ? .55 : .45) + next() * .35;
      const child = dir.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, spread));
      child.y = Math.max(child.y * (depth > 2 ? .75 : 1), .12); child.normalize();
      grow(end, child, length * (.7 + next() * .12), radius * .66, depth + 1);
    }
  };
  grow(new Vector3(0, .25, 0), new Vector3(.08, 1, 0).normalize(), 1.9, .2, 0);
  return { segments, tips };
}

/** `mirror` renders the reflection seen in the water: flipped, dimmer, drawn from both sides. */
function Tree({ still, mirror = false }: { still: boolean; mirror?: boolean }) {
  const { segments, tips } = useMemo(growTree, []);
  const bark = useRef<InstancedMesh>(null), glow = useRef<InstancedMesh>(null);
  const lower = useMemo(() => segments.filter((s) => s.depth < 3), [segments]);
  const upper = useMemo(() => segments.filter((s) => s.depth >= 3), [segments]);
  const place = (mesh: InstancedMesh | null, list: Segment[]) => {
    if (!mesh) return;
    const dummy = new Object3D(), up = new Vector3(0, 1, 0);
    list.forEach((s, i) => {
      const length = s.start.distanceTo(s.end);
      dummy.position.copy(s.start).lerp(s.end, .5);
      dummy.quaternion.setFromUnitVectors(up, s.end.clone().sub(s.start).normalize());
      const girth = s.depth >= 3 ? s.radius * .55 : s.radius; dummy.scale.set(girth, length, girth); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => { place(bark.current, lower); place(glow.current, upper); }, [lower, upper]);
  const tint = useMemo(() => new Color(), []);
  // A pulse of light climbs from the trunk to the tips while "follow-up questions" is on screen.
  useFrame((state) => {
    const mesh = glow.current; if (!mesh) return;
    const pulse = near(3, 1.1), t = still ? .5 : state.clock.elapsedTime;
    const front = 3 + ((t * .9) % 4.5);
    upper.forEach((s, i) => {
      const wave = pulse * Math.max(0, 1 - Math.abs(s.depth - front) / .9);
      tint.setHex(P.teal).multiplyScalar(.18 + (s.depth - 3) * .16 + wave * 2.4);
      mesh.setColorAt(i, tint);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <group>
    <instancedMesh ref={bark} args={[undefined, undefined, lower.length]}>
      <cylinderGeometry args={[.72, 1, 1, 18]} />
      <meshStandardMaterial color={P.charcoal} roughness={.55} metalness={.1} emissive={P.teal} emissiveIntensity={.06} side={mirror ? DoubleSide : undefined} transparent={mirror} opacity={mirror ? .5 : 1} />
    </instancedMesh>
    <instancedMesh ref={glow} args={[undefined, undefined, upper.length]}>
      <cylinderGeometry args={[.7, 1, 1, 8]} />
      <meshBasicMaterial toneMapped={false} side={mirror ? DoubleSide : undefined} transparent={mirror} opacity={mirror ? .55 : 1} />
    </instancedMesh>
    <Canopy tips={tips} still={still} dim={mirror ? .6 : 1} />
  </group>;
}

/** Thousands of glowing points around the branch tips; in "performance" they become teal and amber evidence. */
function Canopy({ tips, still, dim = 1 }: { tips: Vector3[]; still: boolean; dim?: number }) {
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: { value: 0 }, evidence: { value: 0 }, bloom: { value: 1 }, dim: { value: dim }, ivory: { value: new Color(P.ivory) }, teal: { value: new Color(P.teal) }, amber: { value: new Color(P.amber) }, scale: { value: 1 } },
    vertexShader: 'attribute float seed; attribute float kind; uniform float time; uniform float bloom; uniform float scale; varying float vSeed; varying float vKind; varying float vTw;\n'
      + 'void main(){ vSeed=seed; vKind=kind; vec3 p=position; p+=vec3(sin(time*.6+seed*30.),cos(time*.5+seed*20.),sin(time*.4+seed*12.))*.03;\n'
      + ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vTw=.55+.45*sin(time*2.+seed*60.); gl_PointSize=scale*(1.4+seed*2.8)*bloom*(16./-mv.z); }',
    fragmentShader: 'uniform vec3 ivory; uniform vec3 teal; uniform vec3 amber; uniform float evidence; uniform float dim; varying float vSeed; varying float vKind; varying float vTw;\n'
      + 'void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); vec3 base=mix(ivory,teal,smoothstep(.55,1.,vSeed)*.8); vec3 ev=vKind>.5?teal:amber;\n'
      + ' vec3 c=mix(base,ev,evidence); gl_FragColor=vec4(c*(.75+vTw*.9)*dim,a*(.55+vTw*.45)*dim); }',
  }), []);
  const { positions, seeds, kinds } = useMemo(() => {
    const next = random(7), per = Math.ceil((matchMedia('(pointer: coarse)').matches ? 4200 : 12000) / tips.length);
    const positions: number[] = [], seeds: number[] = [], kinds: number[] = [];
    for (const tip of tips) for (let i = 0; i < per; i++) {
      const r = Math.pow(next(), .7) * .95, a = next() * Math.PI * 2, b = Math.acos(next() * 2 - 1);
      positions.push(tip.x + r * Math.sin(b) * Math.cos(a) * 1.25, tip.y + r * Math.cos(b) * .55 + .08, tip.z + r * Math.sin(b) * Math.sin(a) * 1.25);
      seeds.push(next()); kinds.push(next() < .64 ? 1 : 0);
    }
    return { positions: new Float32Array(positions), seeds: new Float32Array(seeds), kinds: new Float32Array(kinds) };
  }, [tips]);
  useFrame((state, delta) => {
    material.uniforms.time.value = still ? 0 : state.clock.elapsedTime;
    const target = near(5, 1.2);
    material.uniforms.evidence.value = MathUtils.damp(material.uniforms.evidence.value, target, 3, delta);
    material.uniforms.bloom.value = 1 + near(7, 1.4) * .35 + near(4, .8) * .25;
    material.uniforms.scale.value = state.gl.getPixelRatio();
  });
  return <points material={material}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-seed" args={[seeds, 1]} />
      <bufferAttribute attach="attributes-kind" args={[kinds, 1]} />
    </bufferGeometry>
  </points>;
}

/** Glowing roots across the island: your résumé, lit while "how it works" is on screen. */
function Roots() {
  const tubes = useMemo(() => {
    const next = random(91);
    return Array.from({ length: 9 }, (_, i) => {
      const angle = (i / 9) * Math.PI * 2 + next() * .4, reach = 1.6 + next() * 1.6;
      const points = [new Vector3(0, .32, 0), new Vector3(Math.cos(angle) * reach * .35, .3, Math.sin(angle) * reach * .35), new Vector3(Math.cos(angle + .2) * reach * .7, .26, Math.sin(angle + .2) * reach * .7), new Vector3(Math.cos(angle + .35) * reach, .2, Math.sin(angle + .35) * reach)];
      return new TubeGeometry(new CatmullRomCurve3(points), 32, .025 + next() * .02, 6);
    });
  }, []);
  const material = useMemo(() => new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    uniforms: { glow: { value: .25 }, teal: { value: new Color(P.teal) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float glow; uniform vec3 teal; varying vec2 vUv; void main(){ float fade=1.-smoothstep(.0,1.,vUv.x)*.85; gl_FragColor=vec4(teal*(.6+glow*2.2),fade*(.25+glow*.75)); }' }), []);
  useFrame((_, delta) => { material.uniforms.glow.value = MathUtils.damp(material.uniforms.glow.value, .2 + near(2, 1.1) * 1.1 + near(7, 1.2) * .4, 3, delta); });
  return <group>{tubes.map((geometry, i) => <mesh key={i} geometry={geometry} material={material} />)}</group>;
}

/** The path of light for "personalized improvement": it draws from the canopy down to the water's edge. */
function LightPath() {
  const { geometry, count } = useMemo(() => {
    const points = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return new Vector3(Math.sin(t * 5) * (2.2 - t * 1.2), 4.6 - t * 4.4, Math.cos(t * 5) * (2.2 - t * 1.2) + t * 3.5); });
    const geometry = new TubeGeometry(new CatmullRomCurve3(points), 160, .035, 8);
    return { geometry, count: geometry.index ? geometry.index.count : 0 };
  }, []);
  const drawn = useRef(0);
  useFrame((_, delta) => {
    drawn.current = MathUtils.damp(drawn.current, Math.min(1, Math.max(0, (scrollState.chapter - 5.7) * 1.4)), 4, delta);
    geometry.setDrawRange(0, Math.floor(count * drawn.current / 6) * 6);
  });
  return <mesh geometry={geometry}><meshBasicMaterial color={new Color(P.amber).multiplyScalar(2.4)} toneMapped={false} transparent opacity={.9} /></mesh>;
}

function Fireflies({ count, still }: { count: number; still: boolean }) {
  const material = useMemo(() => new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: { value: 0 }, amber: { value: new Color(P.amber) }, ivory: { value: new Color(P.ivory) }, scale: { value: 1 } },
    vertexShader: 'attribute float seed; uniform float time; uniform float scale; varying float vA; void main(){ vec3 p=position; float t=time*.25+seed*40.;\n'
      + ' p+=vec3(sin(t)*.8,sin(t*1.3)*.4,cos(t*.9)*.8); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vA=.35+.65*pow(.5+.5*sin(time*1.7+seed*90.),3.); gl_PointSize=scale*3.*(10./-mv.z); }',
    fragmentShader: 'uniform vec3 amber; uniform vec3 ivory; varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(mix(amber,ivory,.25)*1.8,smoothstep(.5,0.,d)*vA); }' }), []);
  const data = useMemo(() => {
    const next = random(5), positions: number[] = [], seeds: number[] = [];
    for (let i = 0; i < count; i++) { const r = 2.5 + next() * 14, a = next() * Math.PI * 2; positions.push(Math.cos(a) * r, .4 + next() * 5.5, Math.sin(a) * r - 2); seeds.push(next()); }
    return { positions: new Float32Array(positions), seeds: new Float32Array(seeds) };
  }, [count]);
  useFrame((state) => { material.uniforms.time.value = still ? 0 : state.clock.elapsedTime; material.uniforms.scale.value = state.gl.getPixelRatio(); });
  return <points material={material}><bufferGeometry><bufferAttribute attach="attributes-position" args={[data.positions, 3]} /><bufferAttribute attach="attributes-seed" args={[data.seeds, 1]} /></bufferGeometry></points>;
}

/** Dark tree silhouettes around the clearing, fading into the fog: depth without detail. */
function Forest() {
  const mesh = useRef<InstancedMesh>(null);
  const count = 90;
  useLayoutEffect(() => {
    const next = random(41), matrix = new Matrix4(), dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const a = next() * Math.PI * 2, r = 20 + next() * 22, h = 9 + next() * 12;
      dummy.position.set(Math.cos(a) * r, h / 2 - .2, Math.sin(a) * r - 8); dummy.scale.set(2.4 + next() * 3, h, 2.4 + next() * 3); dummy.rotation.y = next() * 3; dummy.updateMatrix();
      matrix.copy(dummy.matrix); mesh.current?.setMatrixAt(i, matrix);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={mesh} args={[undefined, undefined, count]}><coneGeometry args={[1, 1, 12]} /><meshBasicMaterial color={P.charcoal} /></instancedMesh>;
}

/** Sky dome: ink overhead, a faint teal haze at the horizon, a soft moon glow upper left. */
function Sky() {
  const material = useMemo(() => new ShaderMaterial({ side: BackSide, depthWrite: false,
    uniforms: { ink: { value: new Color(P.ink) }, teal: { value: new Color(P.teal) }, ivory: { value: new Color(P.ivory) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 ink; uniform vec3 teal; uniform vec3 ivory; varying vec3 vDir; void main(){ float horizon=exp(-abs(vDir.y)*14.)*step(-.02,vDir.y);\n'
      + ' vec3 moonDir=normalize(vec3(-.55,.45,-.7)); float moon=pow(max(dot(vDir,moonDir),0.),24.); vec3 c=ink+teal*horizon*.09+ivory*moon*.12+teal*pow(max(dot(vDir,moonDir),0.),4.)*.06; gl_FragColor=vec4(c,1.); }' }), []);
  return <mesh material={material}><sphereGeometry args={[80, 32, 16]} /></mesh>;
}

export function TreeWorld({ tier, still }: { tier: 'high' | 'medium'; still: boolean }) {
  return <>
    <Sky />
    <Forest />
    <mesh position={[0, .02, 0]} scale={[2.6, .32, 2.2]}><sphereGeometry args={[1, 32, 16]} /><meshStandardMaterial color={P.ink} roughness={.95} emissive={P.teal} emissiveIntensity={.04} /></mesh>
    <Roots />
    <Tree still={still} />
    <group scale={[1, -1, 1]}><Tree still={still} mirror /></group>
    <LightPath />
    <Fireflies count={tier === 'high' ? 220 : 90} still={still} />
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
      <planeGeometry args={[160, 160]} />
      {/* Still water: dark and slightly translucent, so the mirrored tree below glows through it. */}
      <meshBasicMaterial color={P.ink} transparent opacity={tier === 'high' ? .5 : .56} depthWrite={false} />
    </mesh>
  </>;
}
