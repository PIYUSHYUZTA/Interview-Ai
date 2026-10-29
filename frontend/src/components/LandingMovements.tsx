import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import { useLandingReducedMotion } from './landing-motion';

/**
 * "The instrument": a pinned, scroll-driven chapter scene around the Blender asset built by
 * scripts/blender/build_landing_artifact.py. Scrolling moves one camera through three movements (listen,
 * adapt, develop); the copy beside it follows. All three chapters are always in the DOM and readable.
 * Real-time WebGL loads only as the section approaches, renders only while it is on screen, and is
 * replaced by the matching Cycles stills under reduced motion, data saver, low-power devices or WebGL failure.
 */
const CHAPTERS = [
  { key: 'listen', label: 'Listen', title: 'It listens first.', body: 'Answer out loud, in your own words. The interviewer hears your whole answer before it responds, the way a person across the table would.' },
  { key: 'adapt', label: 'Adapt', title: 'Then it follows your thinking.', body: 'Follow-up questions build on what you actually said, probing a decision or a trade-off instead of moving down a fixed list.' },
  { key: 'develop', label: 'Develop', title: 'And shows you the way forward.', body: 'After the conversation, feedback ties each point to your words, then sets out priorities and practice for your next step.' },
] as const;

// Blender camera positions converted to three.js (x, z, -y); the aim is the slab's centre.
const SHOTS = [{ position: [0, 1.45, 5.4], fov: 39.6 }, { position: [4.0, 1.9, 3.8], fov: 39.6 }, { position: [1.3, 4.1, 4.0], fov: 44 }] as const;
const AIM = [0, 1.45, 0] as const;
// Palette, as light and particle colours (non-UI values; the UI uses tokens).
const PALETTE = { ivory: 0xe8e4d3, teal: 0x00aebb, cerulean: 0x007ba7, brass: 0xb99d73, rose: 0xff2d95 };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
/** Scroll progress 0..1 across the three chapters, with a short hold on each one. */
const chapterBlend = (progress: number) => {
  const span = clamp(progress) * 2, index = Math.min(1, Math.floor(span));
  return { index, mix: smooth(clamp((span - index - .18) / .64)) };
};
function prefersStill() {
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return !!device.connection?.saveData || (device.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
}

export function LandingMovements() {
  const reduced = !!useLandingReducedMotion();
  const section = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const [chapter, setChapter] = useState(0);
  const [stillOnly] = useState(prefersStill);
  const [state, setState] = useState<'still' | 'loading' | 'ready'>('still');
  const live = !reduced && !stillOnly && state !== 'still';

  // Chapter and progress rail follow the scroll position (this is user-driven, so it also runs under reduced motion).
  useEffect(() => {
    const element = section.current; if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const progress = clamp(-box.top / Math.max(1, box.height - window.innerHeight));
      rail.current?.style.setProperty('scale', `1 ${progress}`);
      setChapter(progress < 1 / 3 ? 0 : progress < 2 / 3 ? 1 : 2);
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', request, { passive: true }); window.addEventListener('resize', request);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', request); window.removeEventListener('resize', request); };
  }, []);

  // Start the real-time scene as the section approaches.
  useEffect(() => {
    const element = section.current; if (!element || reduced || stillOnly) return;
    const nearby = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setState((value) => value === 'still' ? 'loading' : value); nearby.disconnect(); } }, { rootMargin: '900px 0px' });
    nearby.observe(element);
    return () => nearby.disconnect();
  }, [reduced, stillOnly]);

  useEffect(() => {
    const element = host.current, stage = section.current;
    if (!element || !stage || reduced || stillOnly || state === 'still') return;
    let disposed = false, visible = false, frame = 0, last = 0, time = 0, eased = 0, pointerX = 0, pointerY = 0, lookX = 0, lookY = 0;
    let renderer: Three.WebGLRenderer | undefined, pmrem: Three.PMREMGenerator | undefined, environment: Three.Texture | undefined;
    let root: Three.Object3D | undefined, particles: Three.Points | undefined;
    const controller = new AbortController();
    const fail = () => { if (!disposed) setState('still'); };
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; fail(); };
    const onPointer = (event: PointerEvent) => { if (event.pointerType !== 'mouse') return; pointerX = event.clientX / window.innerWidth - .5; pointerY = event.clientY / window.innerHeight - .5; };
    let draw: (now: number) => void = () => {};
    const schedule = () => { if (!frame && visible && !document.hidden && renderer) frame = requestAnimationFrame(draw); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0; schedule(); });
    const onVisibility = () => { last = 0; schedule(); };

    void (async () => {
      try {
        const [T, { GLTFLoader }, { RoomEnvironment }, response] = await Promise.all([
          import('./three-runtime'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js'),
          fetch('/models/landing-instrument.glb', { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error('instrument unavailable');
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/');
        if (disposed) return;
        root = gltf.scene;
        const coarse = matchMedia('(pointer: coarse)').matches;
        renderer = new T.WebGLRenderer({ alpha: true, antialias: !coarse, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = T.AgXToneMapping; renderer.toneMappingExposure = 1.2;
        renderer.domElement.setAttribute('aria-hidden', 'true');
        renderer.domElement.addEventListener('webglcontextlost', lost);
        element.appendChild(renderer.domElement);

        const scene = new T.Scene();
        pmrem = new T.PMREMGenerator(renderer);
        environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
        scene.environment = environment;
        scene.environmentIntensity = .32;
        scene.add(root);
        root.traverse((node) => { const mesh = node as Three.Mesh; const material = mesh.material as Three.MeshStandardMaterial | undefined; if (material?.name === 'Obsidian') material.envMapIntensity = .45; });
        const key = new T.DirectionalLight(PALETTE.brass, 2.6); key.position.set(-3.4, 4.4, 3.2);
        const rim = new T.DirectionalLight(PALETTE.teal, 2.2); rim.position.set(3.2, 2.8, -2.6);
        const doorway = new T.PointLight(PALETTE.teal, 26, 0, 2); doorway.position.set(0, 1.5, -1.9);
        const fill = new T.DirectionalLight(PALETTE.cerulean, .7); fill.position.set(-2.6, .6, 1.2);
        scene.add(key, rim, doorway, fill, new T.HemisphereLight(PALETTE.ivory, 0x031211, .18));

        const part = (name: string) => root!.getObjectByName(name);
        const ringOuter = part('RingOuter'), ringInner = part('RingInner'), orbit = part('Orbit'), signal = part('Signal') as Three.Mesh | undefined, line = part('ListeningLine') as Three.Mesh | undefined;
        const shards = [0, 1, 2, 3, 4].map((index) => part(`Shard${index}`)).filter(Boolean) as Three.Object3D[];
        const base = new Map([ringOuter, ringInner, orbit, ...shards].filter(Boolean).map((node) => [node!, { quaternion: node!.quaternion.clone(), position: node!.position.clone() }]));
        const up = new T.Vector3(0, 1, 0), turn = new T.Quaternion();
        const signalMaterial = signal?.material as Three.MeshStandardMaterial | undefined, lineMaterial = line?.material as Three.MeshStandardMaterial | undefined;

        // Dust in the light: a few hundred palette-weighted motes, drifting on the GPU.
        const count = coarse ? 220 : 520, positions: number[] = [], colors: number[] = [], seeds: number[] = [];
        const tint = new T.Color();
        for (let index = 0; index < count; index++) {
          const radius = 1.6 + Math.random() * 4.2, angle = Math.random() * Math.PI * 2;
          positions.push(Math.cos(angle) * radius, Math.random() * 4.4 - .2, Math.sin(angle) * radius - 1);
          const pick = Math.random();
          tint.setHex(pick < .62 ? PALETTE.ivory : pick < .84 ? PALETTE.teal : pick < .97 ? PALETTE.brass : PALETTE.rose);
          colors.push(tint.r, tint.g, tint.b); seeds.push(Math.random());
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('seed', new T.Float32BufferAttribute(seeds, 1));
        const dust = new T.ShaderMaterial({
          transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
          uniforms: { time: { value: 0 }, scale: { value: renderer.getPixelRatio() * 42 } },
          vertexShader: 'attribute float seed; uniform float time; uniform float scale; varying vec3 vColor; varying float vFade;\n'
            + 'void main(){ vec3 p=position; float t=time*.12+seed*6.2831; p.x+=sin(t)*.18; p.y=mod(position.y+.2+time*.05,4.4)-.2; p.z+=cos(t*.8)*.18;\n'
            + ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=scale*(.35+seed*.65)/-mv.z; vColor=color; vFade=smoothstep(-.2,.6,p.y)*(1.-smoothstep(3.4,4.2,p.y)); }',
          fragmentShader: 'varying vec3 vColor; varying float vFade; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); gl_FragColor=vec4(vColor*a*.55*vFade,a*vFade); }',
        });
        particles = new T.Points(geometry, dust);
        scene.add(particles);

        const camera = new T.PerspectiveCamera(SHOTS[0].fov, 1, .1, 60);
        const from = new T.Vector3(), to = new T.Vector3(), aim = new T.Vector3(...AIM);
        let width = 0, height = 0;
        const resize = () => {
          const box = element.getBoundingClientRect();
          if (box.width === width && box.height === height) return;
          width = box.width; height = box.height;
          renderer!.setSize(width, height, false);
          camera.aspect = width / Math.max(1, height);
          // Wide screens: the copy owns the left, so the instrument sits right of centre.
          // Portrait screens: the copy owns the bottom, so it sits in the upper part of the frame.
          camera.setViewOffset(width, height, camera.aspect > 1.2 ? -width * .12 : 0, camera.aspect < 1 ? height * .17 : 0, width, height);
        };

        draw = (now: number) => {
          frame = 0;
          if (!renderer || disposed) return;
          const delta = last ? Math.min(.08, (now - last) / 1000) : 0; last = now; time += delta;
          resize();
          const box = stage.getBoundingClientRect();
          const target = clamp(-box.top / Math.max(1, box.height - window.innerHeight));
          eased += (target - eased) * Math.min(1, delta * 3.2 || 1);
          const { index, mix } = chapterBlend(eased);
          from.fromArray(SHOTS[index].position); to.fromArray(SHOTS[index + 1].position);
          camera.position.lerpVectors(from, to, mix);
          lookX += (pointerX - lookX) * Math.min(1, delta * 2); lookY += (pointerY - lookY) * Math.min(1, delta * 2);
          camera.position.x += lookX * .35; camera.position.y -= lookY * .2;
          // Portrait screens pull back so the whole instrument stays in frame.
          const fit = camera.aspect < 1 ? 1 + (1 - camera.aspect) * .9 : 1;
          camera.position.sub(aim).multiplyScalar(fit).add(aim);
          camera.fov = SHOTS[index].fov + (SHOTS[index + 1].fov - SHOTS[index].fov) * mix;
          camera.updateProjectionMatrix();
          camera.lookAt(aim);

          // Listen: the line breathes. Adapt: the orbits open and the crystals gather. Develop: the orbit levels into a crown and the rose signal wakes.
          const adapt = clamp(eased * 2), develop = clamp(eased * 2 - 1);
          if (lineMaterial) lineMaterial.emissiveIntensity = 6 + Math.sin(time * 1.6) * 2.4 * (1 - adapt);
          if (ringOuter) ringOuter.quaternion.copy(turn.setFromAxisAngle(up, time * .12 + eased * Math.PI * .9)).multiply(base.get(ringOuter)!.quaternion);
          if (ringInner) ringInner.quaternion.copy(turn.setFromAxisAngle(up, -time * .2 - eased * Math.PI * .6)).multiply(base.get(ringInner)!.quaternion);
          if (orbit) {
            const rest = base.get(orbit)!;
            orbit.quaternion.copy(rest.quaternion).slerp(turn.setFromAxisAngle(up, 0), develop * .85);
            orbit.rotateY(time * .22);
            orbit.position.y = rest.position.y + develop * .55;
          }
          shards.forEach((shard, order) => {
            const rest = base.get(shard)!;
            shard.position.copy(rest.position).lerp(aim, adapt * .28 - develop * .12);
            shard.position.y += Math.sin(time * .7 + order * 1.7) * .08;
            shard.quaternion.copy(rest.quaternion); shard.rotateY(time * (.25 + order * .06));
          });
          if (signalMaterial) signalMaterial.emissiveIntensity = 2 + develop * 9;
          dust.uniforms.time.value = time;
          renderer.render(scene, camera);
          schedule();
        };
        observer.observe(element);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pointermove', onPointer, { passive: true });
        renderer.compile(scene, camera);
        if (!disposed) setState('ready');
      } catch { fail(); }
    })();

    return () => {
      disposed = true; controller.abort(); cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pointermove', onPointer);
      root?.traverse((node) => {
        const mesh = node as Three.Mesh;
        mesh.geometry?.dispose();
        for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) material.dispose();
      });
      particles?.geometry.dispose(); (particles?.material as Three.Material | undefined)?.dispose();
      environment?.dispose(); pmrem?.dispose();
      renderer?.domElement.removeEventListener('webglcontextlost', lost);
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
    };
    // The scene is built once per load; chapter changes are read from the scroll position inside the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, stillOnly, state === 'still']);

  return <section className="c-movements" id="the-instrument" ref={section} data-theme="dark" aria-labelledby="c-movements-title">
    <div className="c-movements-stage">
      <div className="c-movements-scene" data-instrument-state={live && state === 'ready' ? 'ready' : state === 'loading' && live ? 'loading' : 'still'}>
        {CHAPTERS.map((item, index) => <img key={item.key} className="c-movements-still" data-active={index === chapter ? '' : undefined} src={`/media/instrument-${item.key}.webp`} width={1600} height={1000} alt="" loading="lazy" decoding="async" />)}
        <div className="c-movements-canvas" ref={host} />
        <div className="c-movements-shade" />
      </div>
      <div className="c-movements-copy c-container">
        <p className="c-eyebrow">THE INSTRUMENT · ONE CONVERSATION, THREE MOVEMENTS</p>
        <h2 id="c-movements-title" className="ds-visually-hidden">One conversation, in three movements</h2>
        <div className="c-movements-index" aria-hidden="true">
          {CHAPTERS.map((item, index) => <span key={item.key} data-active={index === chapter ? '' : undefined}>0{index + 1} {item.label}</span>)}
          <span className="c-movements-rail"><span ref={rail} /></span>
        </div>
        {/* All three chapters share one place; only opacity and transform change, so the layout never shifts. */}
        <ol className="c-movements-list">
          {CHAPTERS.map((item, index) => <li key={item.key} data-active={index === chapter ? '' : undefined} data-before={index < chapter ? '' : undefined} aria-current={index === chapter ? 'step' : undefined}>
            <span className="c-movements-number">Movement 0{index + 1} · {item.label}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>)}
        </ol>
      </div>
    </div>
  </section>;
}
