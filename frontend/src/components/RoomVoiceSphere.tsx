import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, CatmullRomCurve3, Color, Group, MathUtils, ShaderMaterial, Vector3 } from 'three';
import { loudnessAt, type AvatarSpeechClock } from './avatar-speech';
import type { RoomState } from './RoomVoice';

/**
 * The interview room's voice sphere and light streams (reference 4: the particle sphere by the hand, with
 * streams of light flowing into the holographic panel). One look per room state, driven by real signals:
 *  - init:        particles gather into the sphere
 *  - interviewer: pulses with the interviewer's speech loudness; streams flow back from the panel
 *  - listening:   a slow breath; the microphone is open and waiting
 *  - speaking:    swells with your microphone level, warmer; streams flow toward the interviewer
 *  - processing:  draws in and spins, while your answer is transcribed and evaluated
 *  - generating:  ripples outward, while the next question is prepared
 */
type Props = { state: RoomState; level: RefObject<number>; speech?: RefObject<AvatarSpeechClock>; still: boolean };

const TEAL = new Color(0x00aebb), IVORY = new Color(0xe8e4d3), AMBER = new Color(0xb99d73);
const LOOK: Record<RoomState, { scale: number; spin: number; ripple: number; warm: number; flow: number; streams: number; floor: number }> = {
  init: { scale: .55, spin: .25, ripple: 0, warm: 0, flow: 1, streams: 0, floor: .08 },
  interviewer: { scale: 1, spin: .15, ripple: 0, warm: 0, flow: -1, streams: 1, floor: .2 },
  listening: { scale: .92, spin: .08, ripple: 0, warm: .15, flow: 1, streams: 0, floor: .1 },
  speaking: { scale: 1, spin: .12, ripple: 0, warm: .4, flow: 1, streams: 1, floor: .1 },
  processing: { scale: .68, spin: 1.6, ripple: 0, warm: .1, flow: 1, streams: 0, floor: .35 },
  generating: { scale: .9, spin: .5, ripple: 1, warm: 0, flow: -1, streams: .4, floor: .3 },
};

function Sphere({ state, level, speech, still }: Props) {
  const energy = useRef(0);
  const sphere = useRef<Group>(null);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: { value: 0 }, energy: { value: 0 }, scale: { value: .2 }, ripple: { value: 0 }, teal: { value: TEAL }, ivory: { value: IVORY }, amber: { value: AMBER }, warm: { value: 0 } },
    vertexShader: 'uniform float time; uniform float energy; uniform float scale; uniform float ripple; attribute float seed; varying float vGlow;\n'
      + 'void main(){ float wave=sin(seed*40.+time*2.2)*.5+.5; float ring=sin(position.y*6.-time*4.)*.5+.5;\n'
      + ' vec3 p=position*scale*(1.+energy*.32*wave+.03*sin(time*.8+seed*9.)+ripple*ring*.14);\n'
      + ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(2.+energy*3.*wave+ripple*ring*1.5)*(6./-mv.z); vGlow=.35+wave*.65; }',
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
  useFrame((frame, delta) => {
    const look = LOOK[state];
    let target = look.floor;
    if (state === 'speaking' || state === 'listening') target = Math.max(look.floor, Math.min(1, (level.current ?? 0) / 60));
    else if (state === 'interviewer') {
      const clock = speech?.current, audio = clock?.audio;
      const loud = audio && !audio.paused ? loudnessAt(clock?.envelope, audio.currentTime) : undefined;
      target = loud === undefined ? .3 : Math.min(1, loud);
    }
    const ease = still ? 1 : Math.min(1, delta * 6);
    energy.current += (target - energy.current) * Math.min(1, still ? 1 : delta * 10);
    const time = still ? 0 : frame.clock.elapsedTime;
    const u = material.uniforms;
    u.time.value = time;
    u.energy.value = still ? Math.max(.15, energy.current) : energy.current;
    u.scale.value = MathUtils.lerp(u.scale.value, look.scale, ease);
    u.ripple.value = MathUtils.lerp(u.ripple.value, look.ripple, ease);
    u.warm.value = MathUtils.lerp(u.warm.value, look.warm, ease);
    if (sphere.current && !still) sphere.current.rotation.y += delta * look.spin;
    for (const { shader } of streams) {
      shader.uniforms.time.value = time;
      shader.uniforms.flow.value = look.flow;
      const want = look.streams * (.45 + energy.current * .55);
      shader.uniforms.strength.value += (want - shader.uniforms.strength.value) * ease;
    }
  });
  return <group position={[-1.6, -.1, 0]}>
    <group ref={sphere}>
      <points material={material}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} /><bufferAttribute attach="attributes-seed" args={[geometry.seeds, 1]} /></bufferGeometry>
      </points>
    </group>
    {streams.map(({ curve, shader }, index) => <mesh key={index} material={shader}><tubeGeometry args={[curve, 64, .012, 6]} /></mesh>)}
  </group>;
}

export default function RoomVoiceSphere(props: Props) {
  return <Canvas className="room-voice-canvas" aria-hidden="true" dpr={[1, 1.5]} frameloop={props.still ? 'demand' : 'always'}
    camera={{ fov: 32, position: [0, 0, 7] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => gl.setClearColor(0x031211, 0)}>
    <Sphere {...props} />
  </Canvas>;
}
