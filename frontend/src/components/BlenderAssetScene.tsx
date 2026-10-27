import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { loudnessAt, visemeAt, visemeWeightsAt, type AvatarSpeechClock } from './avatar-speech';
import { articulation, createIdleLife, type IdleMode } from './avatar-face';
import type * as Three from 'three';
import type { AIState } from './vendor/smooth-ai-core';
import { useLandingReducedMotion } from './landing-motion';
import './BlenderAssetScene.css';

type Props = { variant: 'core' | 'studio' | 'hero'; paused?: boolean; state?: AIState; speech?:RefObject<AvatarSpeechClock>; onStatusChange?: (status: 'loading' | 'ready' | 'fallback') => void };

function disposeModel(root: Three.Object3D) {
  const textures=new Set<Three.Texture>();
  root.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(mat)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as Three.Texture);
    }
    if ('isSkinnedMesh' in mesh) (mesh as Three.SkinnedMesh).skeleton?.dispose();
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
  for(const texture of textures){texture.dispose();if(typeof ImageBitmap!=='undefined'&&texture.image instanceof ImageBitmap)texture.image.close();}
}

// ARKit mouth shapes layered over the visemes (see avatar-face.ts).
const articulationShapes: Record<string, 'jawOpen' | 'mouthFunnel' | 'mouthPucker' | 'mouthStretch' | 'mouthPress'> = { jawOpen: 'jawOpen', mouthFunnel: 'mouthFunnel', mouthPucker: 'mouthPucker', mouthStretchLeft: 'mouthStretch', mouthStretchRight: 'mouthStretch', mouthPressLeft: 'mouthPress', mouthPressRight: 'mouthPress' };
const assets = { core: 'intelligence-core', studio: 'human-interview-studio', hero: 'hero-bust' };
const labels = { core: 'Faceted AI intelligence core with illuminated metallic orbits', studio: 'Digital human interviewer in a softly lit studio', hero: 'Digital human interviewer framed by illuminated orbital rings' };
/** Data-saver, very low memory or very few cores: show the Blender poster instead of loading WebGL. */
function prefersPoster() {
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return !!device.connection?.saveData || (device.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
}

/** Loads Blender-prepared GLBs. State movement illustrates application activity;
 * the human facial rig follows actual speech-engine visemes and the audio clock.
 * Idle expressions are authored animation, never a measure of candidate emotion. */
export function BlenderAssetScene({ variant, paused = false, state = 'idle', onStatusChange, speech }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const activity = useRef({ paused, state, reduced: false });
  const speechRef = useRef(speech);
  useEffect(()=>{speechRef.current=speech;},[speech]);
  const requestDraw = useRef<() => void>(() => {});
  const reduced = useLandingReducedMotion();
  const [posterOnly] = useState(() => variant === 'hero' && prefersPoster());
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(posterOnly ? 'fallback' : 'loading');
  const [revision, setRevision] = useState(0);
  const asset = `/models/${assets[variant]}.glb`;

  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);
  useEffect(() => {
    activity.current = { paused, state, reduced: !!reduced };
    requestDraw.current();
  }, [paused, state, reduced]);

  useEffect(() => {
    const element = host.current;
    if (!element || posterOnly) return;
    let disposed = false, visible = false, started = false, frame = 0, last = 0, elapsed = 0;
    let targetX = 0, targetY = 0, x = 0, y = 0;
    let renderer: Three.WebGLRenderer | undefined;
    let model: Three.Group | undefined;
    let environment: Three.Texture | undefined;
    let environmentTarget: Three.WebGLRenderTarget | undefined;
    let pmrem: Three.PMREMGenerator | undefined;
    let keyShadow: Three.DirectionalLightShadow | undefined;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => { if (!disposed) setStatus('fallback'); };
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; fail(); };
    const restored = () => { if (!disposed) setRevision((value) => value + 1); };
    const cleanRenderer = () => {
      renderer?.domElement.removeEventListener('webglcontextlost', lost);
      renderer?.domElement.removeEventListener('webglcontextrestored', restored);
      if (model) disposeModel(model);
      environment?.dispose(); environmentTarget?.dispose(); pmrem?.dispose(); keyShadow?.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
      model = undefined; renderer = undefined;
    };
    const load = async () => {
      if (started || disposed) return;
      started = true;
      try {
        // The hero's poster is already on screen; start the 3D runtime only once the
        // browser is idle, so the first paint and the text entrance are never blocked.
        if (variant === 'hero') await new Promise<void>((resolve) => { if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 1200 }); else setTimeout(resolve, 300); });
        if (disposed) return;
        timeout = setTimeout(() => controller.abort(), 15000);
        const [T, { GLTFLoader }, { RoomEnvironment }, response] = await Promise.all([
          import('./three-runtime'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js'), fetch(asset, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error('3D asset unavailable');
        const bytes = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(bytes, '/models/');
        if (disposed) { disposeModel(gltf.scene); return; }
        clearTimeout(timeout);
        model = gltf.scene;
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (variant === 'studio' && mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
          
          if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            // Hair, brow and lash cards: alpha-tested coverage sorts correctly at every head angle.
            // The suit's normal map carries deep fold detail that reads as blotches under the rim light.
            if (material.name.includes('casualsuit') && 'normalScale' in material) (material as Three.MeshStandardMaterial).normalScale.setScalar(.3);
            if (variant === 'hero' && material.transparent) { Object.assign(material, { transparent: false, alphaTest: .42, alphaToCoverage: true, depthWrite: true }); }
            if (material.name === 'Ink architectural surface') { const surface=material as Three.MeshStandardMaterial; surface.envMapIntensity=0;surface.roughness=1;surface.metalness=0; }
          }
        });
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setClearColor(0x0a0a0a, 0);
        renderer.toneMapping = variant === 'core' ? T.ACESFilmicToneMapping : T.AgXToneMapping;
        renderer.toneMappingExposure = variant === 'core' ? .88 : variant === 'hero' ? 1.35 : 1.02;
        if (variant === 'studio') { renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; }
        renderer.domElement.setAttribute('aria-hidden', 'true');
        element.appendChild(renderer.domElement);
        renderer.domElement.addEventListener('webglcontextlost', lost);
        renderer.domElement.addEventListener('webglcontextrestored', restored);
        const scene = new T.Scene();
        pmrem = new T.PMREMGenerator(renderer);
        const studioLight = new RoomEnvironment();
        environmentTarget = pmrem.fromScene(studioLight, .04);
        studioLight.dispose();
        environment = environmentTarget.texture;
        scene.environment = environment;
        scene.environmentIntensity = variant === 'core' ? .5 : variant === 'hero' ? .22 : .32;
        scene.add(model);
        // Human scenes are framed from the rig's head joint. The room uses a conversational
        // medium close-up so the synchronized mouth is readable, as on a video call.
        const headJoint = variant === 'core' ? undefined : model.getObjectByName('Head')?.getWorldPosition(new T.Vector3());
        const framing = headJoint
          ? variant === 'hero'
            ? { position: new T.Vector3(0, headJoint.y + .07, 1.95), target: new T.Vector3(0, headJoint.y + .045, 0) }
            : { position: new T.Vector3(0, headJoint.y + .06, headJoint.z + 1.45), target: new T.Vector3(0, headJoint.y - .04, headJoint.z) }
          : variant === 'core' ? { position: new T.Vector3(0, .15, 5.8), target: new T.Vector3() } : { position: new T.Vector3(0, 1.48, 2.35), target: new T.Vector3(0, 1.27, 0) };
        const camera = new T.PerspectiveCamera(variant === 'core' ? 36 : variant === 'hero' ? 39 : headJoint ? 28 : 34, 1, .1, 40);
        camera.position.copy(framing.position);
        camera.lookAt(framing.target);
        // The landing hero is keyed in Warm Ivory; the room keeps its neutral key.
        const keyColor = variant === 'hero' ? 0xe8e4d3 : 0xededed;
        scene.add(new T.HemisphereLight(keyColor, variant === 'hero' ? 0x031211 : 0x0a0a0a, variant === 'core' ? 1 : variant === 'hero' ? .3 : .22));
        const key = new T.DirectionalLight(keyColor, variant === 'core' ? 1.5 : variant === 'hero' ? 1.15 : 2); key.position.set(-3, 4, 4);
        if (variant === 'studio') {
          key.castShadow = true; keyShadow = key.shadow; key.shadow.mapSize.set(1024, 1024);
          Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -2, near: .1, far: 12 });
          key.shadow.normalBias = .015; key.shadow.bias = -.0001;
          key.target.position.set(0, 1.1, 0); scene.add(key.target);
        }
        scene.add(key);
        if (variant !== 'core') {
          // Cerulean rim behind the right shoulder, a restrained Neon Rose kicker on the left cheek.
          const rim = new T.DirectionalLight(0x007ba7, 9); rim.position.set(1.4, framing.target.y + .5, -1.2); scene.add(rim);
          const kicker = new T.DirectionalLight(0xff2d95, variant === 'hero' ? 1.8 : 2.2); kicker.position.set(-1.6, framing.target.y - .2, -.8); scene.add(kicker);
          if (variant === 'hero') { const bounce = new T.DirectionalLight(0xb99d73, .6); bounce.position.set(1.2, framing.target.y - 1, 1.4); scene.add(bounce); }
        } else {
          const rim = new T.PointLight(0x007ba7, 8, 12); rim.position.set(2, 2, 1); scene.add(rim);
          const warm = new T.DirectionalLight(0xff2d95, .7); warm.position.set(-2, 1, -1); scene.add(warm);
        }
        let dust: Three.Points | undefined;
        if (variant === 'hero') {
          // Luminous dust drifting behind the bust, weighted to the palette. Motion lives in the
          // vertex shader; time only advances while motion is allowed, so reduced motion freezes it.
          const count = 520, positions = new Float32Array(count * 3), seeds = new Float32Array(count), tints = new Float32Array(count * 3);
          const palette: Array<[number, number]> = [[0x00aebb, .58], [0x007ba7, .27], [0xb99d73, .12], [0xff2d95, .03]];
          let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          const centre = framing.target;
          for (let index = 0; index < count; index++) {
            const radius = .42 + random() * .95, angle = random() * Math.PI * 2;
            positions.set([centre.x + Math.cos(angle) * radius, centre.y + (random() - .5) * 1.35, centre.z - .12 - Math.abs(Math.sin(angle)) * radius * .55], index * 3);
            seeds[index] = random();
            let pick = random(), hex = palette[0][0];
            for (const [colour, weight] of palette) { if (pick < weight) { hex = colour; break; } pick -= weight; }
            const tint = new T.Color(hex); tints.set([tint.r, tint.g, tint.b], index * 3);
          }
          const geometry = new T.BufferGeometry();
          geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
          geometry.setAttribute('seed', new T.Float32BufferAttribute(seeds, 1));
          geometry.setAttribute('tint', new T.Float32BufferAttribute(tints, 3));
          const material = new T.ShaderMaterial({
            transparent: true, depthWrite: false, blending: T.AdditiveBlending,
            uniforms: { time: { value: 0 }, scale: { value: 1 } },
            vertexShader: `attribute float seed; attribute vec3 tint; uniform float time; uniform float scale; varying vec3 vTint; varying float vAlpha;
              void main() { vec3 p = position; float t = time * .12 + seed * 6.2831; p.y += sin(t) * .06; p.x += cos(t * .7) * .035;
                vec4 view = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * view;
                gl_PointSize = (1.6 + seed * 2.4) * scale * (2.2 / -view.z); vTint = tint; vAlpha = .3 + .45 * (.5 + .5 * sin(time * .8 + seed * 40.)); }`,
            fragmentShader: `varying vec3 vTint; varying float vAlpha;
              void main() { float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vTint * a, a * vAlpha);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
              }`,
          });
          dust = new T.Points(geometry, material); dust.name = 'HeroDust'; model.add(dust);
          element.dataset.particles = String(count);
        }
        const mixer = new T.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
        const head = model.getObjectByName('Head');
        const headRest = head?.quaternion.clone();
        const spine=model.getObjectByName('Spine2'),spineRest=spine?.quaternion.clone();
        const eyes=['LeftEye','RightEye'].map(name=>model!.getObjectByName(name)).filter((eye):eye is Three.Object3D=>!!eye).map(eye=>({eye,rest:eye.quaternion.clone()}));
        const idle=createIdleLife(); let settleUntil=0, wasSpeaking=false;
        const parentTurn=new T.Quaternion(), parentInverse=new T.Quaternion(), gazeTurn=new T.Quaternion(), gazeAngles=new T.Euler();
        const faceMeshes:Three.Mesh[]=[]; model.traverse(node=>{const mesh=node as Three.Mesh;if(mesh.morphTargetDictionary&&mesh.morphTargetInfluences)faceMeshes.push(mesh);});
        element.dataset.morphTargets=String(faceMeshes.reduce((total,mesh)=>total+Object.keys(mesh.morphTargetDictionary!).length,0));
        element.dataset.rigged=String(!!head);
        element.dataset.animationClips = String(gltf.animations.length);
        let frames = 0, slowStart = 0, slowFrames = 0;
        const draw = (now: number) => {
          frame = 0;
          if (disposed || !visible || document.hidden || !renderer || !model || renderer.getContext().isContextLost()) { last = 0; return; }
          const moving = !activity.current.paused && !activity.current.reduced;
          const clock=speechRef.current?.current;
          const speaking=!!(clock?.audio && !clock.audio.paused && !clock.audio.ended && activity.current.state === 'streaming');
          // When speech ends or is interrupted, the mouth eases back to rest instead of snapping.
          if(speaking) wasSpeaking=true; else if(wasSpeaking){wasSpeaking=false;settleUntil=now+400;}
          const settling=now<settleUntil;
          const animate=moving||speaking||settling;
          if (animate && last && now - last < 1000 / 30) { frame = requestAnimationFrame(draw); return; }
          const delta = last ? Math.min((now - last) / 1000, .08) : 1 / 30;
          last = animate ? now : 0;
          if (moving) {
            elapsed += delta;
            x += (targetX - x) * (1 - Math.exp(-delta * 7)); y += (targetY - y) * (1 - Math.exp(-delta * 7));
            mixer.update(delta * (variant === 'core' ? .18 : variant === 'hero' ? .35 : .7));
          }
          // Architecture stays anchored. A small camera offset reveals real room depth.
          if (variant !== 'studio') { model.rotation.y = x * .13; model.rotation.x = y * (variant === 'hero' ? .03 : .06); }
          else { camera.position.x = framing.position.x + (moving ? x * .035 : 0); camera.position.y = framing.position.y + (moving ? y * .015 : 0); camera.lookAt(framing.target); }
          const mode:IdleMode=activity.current.state==='streaming'?'speaking':activity.current.state==='listening'?'listening':activity.current.state==='thinking'?'thinking':'idle';
          const pose=moving ? idle.update(delta,mode) : undefined;
          if(head && headRest){
            head.quaternion.copy(headRest);
            if(pose){head.rotateY(pose.headYaw);head.rotateX(pose.headPitch);head.rotateZ(pose.headRoll);}
          }
          // Gaze is applied in world space so it is independent of each eye bone's local axes.
          for(const {eye,rest} of eyes){
            eye.quaternion.copy(rest);
            if(pose&&eye.parent){
              eye.parent.updateWorldMatrix(true,false); eye.parent.getWorldQuaternion(parentTurn); parentInverse.copy(parentTurn).invert();
              gazeTurn.setFromEuler(gazeAngles.set(-pose.gazePitch,pose.gazeYaw,0,'YXZ'));
              eye.quaternion.copy(parentInverse).multiply(gazeTurn).multiply(parentTurn).multiply(rest);
            }
          }
          if(spine&&spineRest){spine.quaternion.copy(spineRest);if(moving)spine.rotateX(Math.sin(elapsed*.8)*.003);}
          const viseme=speaking&&clock ? visemeAt(clock.cues,clock.audio!.currentTime) : 'viseme_sil';
          const mouth=speaking&&clock ? visemeWeightsAt(clock.cues,clock.audio!.currentTime,clock.envelope) : undefined;
          const lips=mouth&&clock ? articulation(mouth,loudnessAt(clock.envelope,clock.audio!.currentTime)) : undefined;
          const blink=pose?.blink ?? 0;
          element.dataset.jawOpen=(lips?.jawOpen ?? 0).toFixed(3);
          element.dataset.gaze=pose ? `${pose.gazeYaw.toFixed(3)},${pose.gazePitch.toFixed(3)}` : '0,0';
          let mouthWeight=0;
          for(const mesh of faceMeshes){
            for(const [name,index] of Object.entries(mesh.morphTargetDictionary!)){
              let target=0;
              const mouthShape=name.startsWith('viseme_')||name in articulationShapes;
              if(name.startsWith('viseme_')) target=mouth?.get(name) ?? 0;
              else if(name in articulationShapes) target=lips ? lips[articulationShapes[name]] : 0;
              else if(name==='eyeBlinkLeft'||name==='eyeBlinkRight') target=blink;
              else if(name==='mouthSmileLeft'||name==='mouthSmileRight') target=activity.current.state==='idle'?.12:.035;
              else if(name==='browInnerUp') target=activity.current.state==='listening'?.09:.025;
              const weights=mesh.morphTargetInfluences!;
              if(mouthShape&&!speaking&&!settling) weights[index]=0;
              else weights[index]+=(target-weights[index])*(1-Math.exp(-delta*(mouthShape?34:name.startsWith('eyeBlink')?60:22)));
              if(name.startsWith('viseme_')&&name!=='viseme_sil')mouthWeight=Math.max(mouthWeight,weights[index]);
            }
          }
          element.dataset.viseme=viseme;
          element.dataset.mouthWeight=mouthWeight.toFixed(3);
          element.dataset.audioTime=clock?.audio?.currentTime.toFixed(3)??'0';
          element.dataset.blink=Math.max(0,...faceMeshes.map(mesh=>mesh.morphTargetInfluences![mesh.morphTargetDictionary!.eyeBlinkLeft]??0)).toFixed(3);
          if (variant !== 'studio' && (moving || activity.current.reduced)) {
            // A restrained dolly settles into the product, then slowly drifts.
            // Time advances only while visible and motion is permitted.
            const entrance = moving ? Math.exp(-elapsed * 1.6) : 0;
            const travel = framing.position.z / 5.8;
            camera.position.set(
              framing.position.x + (moving ? (Math.sin(elapsed * .12) * .1 + x * .12) * travel : 0),
              framing.position.y + (moving ? (Math.sin(elapsed * .1) * .05 + y * .06) * travel : 0),
              framing.position.z + entrance * .55 * travel,
            );
            camera.lookAt(framing.target);
          }
          if (dust) { const uniforms = (dust.material as Three.ShaderMaterial).uniforms; uniforms.time.value = elapsed; uniforms.scale.value = renderer.getPixelRatio(); }
          renderer.render(scene, camera);
          element.dataset.frames = String(++frames);
          element.dataset.animationTime = mixer.time.toFixed(3);
          element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(4)).join(',');
          element.dataset.rotation = `${model.rotation.x.toFixed(4)},${model.rotation.y.toFixed(4)}`;
          element.dataset.triangles = String(renderer.info.render.triangles);
          if (frames === 1) setStatus('ready');
          // If the device cannot hold roughly 12fps once warmed up, settle on the poster.
          if (variant === 'hero' && moving && frames > 10) {
            if (!slowStart) slowStart = now;
            if (++slowFrames === 40) {
              const interval = (now - slowStart) / 39;
              element.dataset.frameInterval = interval.toFixed(1);
              if (interval > 85) { cancelAnimationFrame(frame); frame = 0; cleanRenderer(); fail(); return; }
            }
          }
          if (animate) frame = requestAnimationFrame(draw);
        };
        requestDraw.current = () => { if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(draw); };
        const resize = () => {
          if (!renderer) return;
          const bounds = element.getBoundingClientRect();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25, 900 / Math.max(bounds.width, bounds.height, 1)));
          renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
          camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height);
          camera.updateProjectionMatrix(); requestDraw.current();
        };
        sizing = new ResizeObserver(resize); sizing.observe(element); resize();
        requestDraw.current();
      } catch {
        clearTimeout(timeout);
        if (!disposed) { cleanRenderer(); fail(); }
      }
    };
    let sizing: ResizeObserver | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; last = 0;
      if (visible) { void load(); requestDraw.current(); }
      else { cancelAnimationFrame(frame); frame = 0; }
    }, { rootMargin: '60px' });
    observer.observe(element);
    const move = (event: PointerEvent) => {
      if (activity.current.paused || activity.current.reduced || event.pointerType !== 'mouse') return;
      const bounds = element.getBoundingClientRect();
      targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 2;
      targetY = ((event.clientY - bounds.top) / bounds.height - .5) * 2;
    };
    const leave = () => { targetX = 0; targetY = 0; };
    const visibility = () => { last = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else requestDraw.current(); };
    element.addEventListener('pointermove', move); element.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; controller.abort(); clearTimeout(timeout); cancelAnimationFrame(frame);
      requestDraw.current = () => {}; observer.disconnect(); sizing?.disconnect();
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', visibility); cleanRenderer();
    };
  }, [asset, variant, revision, posterOnly]);

  return <div ref={host} className={`blender-asset ${variant === 'studio' ? 'blender-studio' : 'c-sculpture'} ${variant === 'hero' ? 'c-hero-bust' : ''}`} role="img" aria-label={labels[variant]} data-asset={asset} data-scene-state={status} data-state={state} data-motion={paused || reduced ? 'still' : 'active'} data-poster-only={posterOnly || undefined} aria-busy={status === 'loading'}>
    {status !== 'ready' && variant === 'hero' && <img className="blender-static blender-poster" src="/models/hero-bust-poster.webp" alt="" decoding="async" />}
    {status !== 'ready' && variant !== 'hero' && <svg className="blender-static" viewBox="0 0 400 400" aria-hidden="true"><ellipse cx="200" cy="200" rx="145" ry="105" transform="rotate(-25 200 200)" fill="none" style={{ stroke: 'var(--paint-cerulean-text)' }} strokeWidth="3" /><path d="m200 100 88 100-88 100-88-100Z" style={{ fill: 'var(--paint-jet)', stroke: 'var(--paint-cerulean-text)' }} strokeWidth="2" /><path d="m200 100 25 100-25 100m-88-100h176" fill="none" style={{ stroke: 'var(--paint-rose-text)' }} strokeWidth="1" /></svg>}
  </div>;
}
