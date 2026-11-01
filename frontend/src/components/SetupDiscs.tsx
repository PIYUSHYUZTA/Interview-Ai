import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Color, Group, MathUtils, ShaderMaterial } from 'three';

/**
 * The setup page's three stacked discs (reference 3: three tilted discs with iridescent rims), one per setup
 * stage. The current stage's disc comes forward with a bright thin-film rim; completed discs keep a steady
 * teal rim; upcoming discs are dim. The sheen is limited to the brand's teal → ivory → amber.
 */
const TEAL = new Color(0x00aebb), IVORY = new Color(0xe8e4d3), AMBER = new Color(0xb99d73);

/** Thin-film rim: hue shifts with viewing angle and position around the ring, within the six-colour palette. */
function rimMaterial() {
  return new ShaderMaterial({
    transparent: true, toneMapped: false,
    uniforms: { teal: { value: TEAL }, ivory: { value: IVORY }, amber: { value: AMBER }, glow: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec3 vNormal; varying vec3 vView; varying vec2 vUv; void main(){ vUv=uv; vec4 world=modelMatrix*vec4(position,1.); vNormal=normalize(mat3(modelMatrix)*normal); vView=normalize(cameraPosition-world.xyz); gl_Position=projectionMatrix*viewMatrix*world; }',
    fragmentShader: 'uniform vec3 teal; uniform vec3 ivory; uniform vec3 amber; uniform float glow; uniform float time; varying vec3 vNormal; varying vec3 vView; varying vec2 vUv;\n'
      + 'void main(){ float facing=1.-abs(dot(normalize(vNormal),normalize(vView))); float t=fract(vUv.x+facing*.6+time*.03);\n'
      + ' vec3 c = t<.33 ? mix(teal,ivory,t/.33) : t<.66 ? mix(ivory,amber,(t-.33)/.33) : mix(amber,teal,(t-.66)/.34);\n'
      + ' float a=(.35+facing*.9)*glow; gl_FragColor=vec4(c*(.6+glow*1.4),clamp(a,0.,1.)); }',
  });
}

function Discs({ stage, still }: { stage: number; still: boolean }) {
  const group = useRef<Group>(null);
  const discs = useRef<(Group | null)[]>([]);
  const rims = useMemo(() => [rimMaterial(), rimMaterial(), rimMaterial()], []);
  useFrame((state, delta) => {
    const step = still ? 1 : Math.min(1, delta * 3);
    discs.current.forEach((disc, index) => {
      if (!disc) return;
      const current = index === stage - 1, done = index < stage - 1;
      // The current disc comes forward and turns a little more toward the viewer.
      disc.position.z = MathUtils.lerp(disc.position.z, current ? .9 : 0, step);
      disc.rotation.x = MathUtils.lerp(disc.rotation.x, current ? 1.05 : 1.2, step);
      const glow = current ? 1.25 : done ? .7 : .28;
      rims[index].uniforms.glow.value = MathUtils.lerp(rims[index].uniforms.glow.value, glow, step);
      rims[index].uniforms.time.value = still ? 0 : state.clock.elapsedTime;
    });
    if (group.current && !still) group.current.rotation.y = Math.sin(state.clock.elapsedTime * .3) * .12 - .25;
  });
  return <group ref={group} rotation={[0, -.25, .12]}>
    {[0, 1, 2].map((index) => <group key={index} ref={(node) => { discs.current[index] = node; }} position={[0, 1.15 - index * 1.15, 0]} rotation={[1.2, 0, 0]}>
      <mesh><cylinderGeometry args={[1, 1, .06, 96]} /><meshPhysicalMaterial color={0x031211} roughness={.42} metalness={0} clearcoat={.35} clearcoatRoughness={.3} envMapIntensity={.18} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1, .034, 16, 160]} /><primitive object={rims[index]} attach="material" /></mesh>
    </group>)}
  </group>;
}

export default function SetupDiscs({ stage, still }: { stage: number; still: boolean }) {
  return <Canvas className="su-discs-canvas" aria-hidden="true" dpr={[1, 1.75]} frameloop={still ? 'demand' : 'always'} camera={{ fov: 30, position: [0, 0, 9.5] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearColor(0x031211, 0)}>
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={1.6} color={0xe8e4d3} position={[-3, 3, 3]} scale={[4, 2, 1]} />
      <Lightformer form="rect" intensity={1.2} color={0x00aebb} position={[3, -1, 2]} scale={[3, 3, 1]} />
    </Environment>
    <Discs stage={stage} still={still} />
  </Canvas>;
}
