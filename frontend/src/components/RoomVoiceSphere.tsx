import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, CatmullRomCurve3, Color, ShaderMaterial, Vector3 } from 'three';
import { loudnessAt, type AvatarSpeechClock } from './avatar-speech';

/**
 * The interview room's voice sphere and light streams (reference 4: the particle sphere by the hand, with
 * streams of light flowing into the holographic panel). Driven by real signals only: the microphone input
 * level while you answer, and the interviewer's speech loudness envelope while it speaks. Streams flow toward
 * the interviewer while you speak and back while it speaks; with nobody speaking, the sphere only breathes.
 */
export type VoiceMode = 'you' | 'interviewer' | 'idle';
type Props = { mode: VoiceMode; level: RefObject<number>; speech?: RefObject<AvatarSpeechClock>; still: boolean };

const TEAL = new Color(0x00aebb), IVORY = new Color(0xe8e4d3), AMBER = new Color(0xb99d73);

function Sphere({ mode, level, speech, still }: Props) {
  const energy = useRef(0);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: { value: 0 }, energy: { value: 0 }, teal: { value: TEAL }, ivory: { value: IVORY }, amber: { value: AMBER }, warm: { value: 0 } },
    vertexShader: 'uniform float time; uniform float energy; attribute float seed; varying float vGlow;\n'
      + 'void main(){ float wave=sin(seed*40.+time*2.2)*.5+.5; vec3 p=position*(1.+energy*.32*wave+.03*sin(time*.8+seed*9.));\n'
      + ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(2.+energy*3.*wave)*(6./-mv.z); vGlow=.35+wave*.65; }',
    fragmentShader: 'uniform vec3 teal; uniform vec3 ivory; uniform vec3 amber; uniform float energy; uniform float warm; varying float vGlow;\n'
      + 'void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d)*vGlow; vec3 c=mix(mix(teal,ivory,vGlow*.5),amber,warm); gl_FragColor=vec4(c*(.7+energy*1.6),a); }',
  }), []);
  const geometry = useMemo(() => {
    const count = 900, positions: number[] = [], seeds: number[] = [];
    for (let i = 0; i < count; i++) { // Fibonacci sphere, evenly spread
      const y = 1 - (i / (count - 1)) * 2, r = Math.sqrt(1 - y * y), theta = i * 2.39996;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r); seeds.push(Math.random());
    }
    return { positions: new Float32Array(positions), seeds: new Float32Array(seeds) };
  }, []);
  const streams = useMemo(() => [0, 1, 2, 3, 4].map((i) => {
    const spread = (i - 2) * .28;
    const curve = new CatmullRomCurve3([new Vector3(.6, spread * .4, 0), new Vector3(1.8, .5 + spread, .3), new Vector3(3, .2 + spread * .6, -.1), new Vector3(4.4, .35 + spread * .3, 0)]);
    const shader = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { time: { value: 0 }, flow: { value: 1 }, strength: { value: 0 }, teal: { value: TEAL }, ivory: { value: IVORY }, offset: { value: i * .37 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float time; uniform float flow; uniform float strength; uniform vec3 teal; uniform vec3 ivory; uniform float offset; varying vec2 vUv;\n'
        + 'void main(){ float dash=smoothstep(.0,.35,fract(vUv.x*5.-time*.9*flow+offset))*smoothstep(1.,.65,fract(vUv.x*5.-time*.9*flow+offset));\n'
        + ' float edge=smoothstep(0.,.15,vUv.x)*smoothstep(1.,.85,vUv.x); gl_FragColor=vec4(mix(teal,ivory,dash*.6)*1.6,(.12+dash*.88)*edge*strength); }',
    });
    return { curve, shader };
  }), []);
  useFrame((state, delta) => {
    let target = .05;
    if (mode === 'you') target = Math.min(1, (level.current ?? 0) / 60);
    else if (mode === 'interviewer') {
      const clock = speech?.current, audio = clock?.audio;
      const loud = audio && !audio.paused ? loudnessAt(clock?.envelope, audio.currentTime) : undefined;
      target = loud === undefined ? .3 : Math.min(1, loud);
    }
    energy.current += (target - energy.current) * Math.min(1, delta * 10);
    const time = still ? 0 : state.clock.elapsedTime;
    material.uniforms.time.value = time;
    material.uniforms.energy.value = still ? Math.max(.15, energy.current) : energy.current;
    material.uniforms.warm.value += ((mode === 'you' ? .35 : 0) - material.uniforms.warm.value) * Math.min(1, delta * 4);
    for (const { shader } of streams) {
      shader.uniforms.time.value = time;
      shader.uniforms.flow.value = mode === 'interviewer' ? -1 : 1;
      const want = mode === 'idle' ? 0 : .45 + energy.current * .55;
      shader.uniforms.strength.value += (want - shader.uniforms.strength.value) * Math.min(1, delta * 4);
    }
  });
  return <group position={[-1.6, -.1, 0]}>
    <points material={material}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} /><bufferAttribute attach="attributes-seed" args={[geometry.seeds, 1]} /></bufferGeometry>
    </points>
    {streams.map(({ curve, shader }, index) => <mesh key={index} material={shader}><tubeGeometry args={[curve, 64, .012, 6]} /></mesh>)}
  </group>;
}

export default function RoomVoiceSphere(props: Props) {
  return <Canvas className="room-voice-canvas" aria-hidden="true" dpr={[1, 1.5]} frameloop={props.still ? 'demand' : 'always'}
    camera={{ fov: 32, position: [0, 0, 7] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearColor(0x031211, 0)}>
    <Sphere {...props} />
  </Canvas>;
}
