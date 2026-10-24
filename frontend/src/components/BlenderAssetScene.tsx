import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { visemeAt, type AvatarSpeechClock } from './avatar-speech';
import type * as Three from 'three';
import type { AIState } from './vendor/smooth-ai-core';
import { useLandingReducedMotion } from './landing-motion';
import './BlenderAssetScene.css';

type Props = { variant: 'core' | 'studio'; paused?: boolean; state?: AIState; speech?:RefObject<AvatarSpeechClock>; onStatusChange?: (status: 'loading' | 'ready' | 'fallback') => void };

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [revision, setRevision] = useState(0);
  const asset = `/models/${variant === 'core' ? 'intelligence-core' : 'human-interview-studio'}.glb`;

  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);
  useEffect(() => {
    activity.current = { paused, state, reduced: !!reduced };
    requestDraw.current();
  }, [paused, state, reduced]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
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
            if (material.name === 'Ink architectural surface') { const surface=material as Three.MeshStandardMaterial; surface.envMapIntensity=0;surface.roughness=1;surface.metalness=0; }
          }
        });
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setClearColor(0x031211, 0);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = variant === 'core' ? .88 : .95;
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
        scene.environmentIntensity = variant === 'core' ? .5 : .32;
        scene.add(model);
        const camera = new T.PerspectiveCamera(variant === 'core' ? 36 : 34, 1, .1, 40);
        camera.position.set(0, variant === 'core' ? .15 : 1.48, variant === 'core' ? 5.8 : 2.35);
        camera.lookAt(0, variant === 'core' ? 0 : 1.27, 0);
        scene.add(new T.HemisphereLight(0xe8e4d3, 0x031211, variant === 'core' ? 1 : .45));
        const key = new T.DirectionalLight(0xe8e4d3, variant === 'core' ? 1.5 : 2); key.position.set(-3, 4, 4);
        if (variant === 'studio') {
          key.castShadow = true; keyShadow = key.shadow; key.shadow.mapSize.set(1024, 1024);
          Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -2, near: .1, far: 12 });
          key.shadow.normalBias = .015; key.shadow.bias = -.0001;
          key.target.position.set(0, 1.1, 0); scene.add(key.target);
        }
        scene.add(key);
        const rim = new T.PointLight(0x00aebb, variant === 'core' ? 8 : 2.5, 12); rim.position.set(2, 2, 1); scene.add(rim);
        const warm = new T.DirectionalLight(0xb99d73, .7); warm.position.set(-2, 1, -1); scene.add(warm);
        const mixer = new T.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
        const head = model.getObjectByName('Head');
        const headRest = head?.quaternion.clone();
        const spine=model.getObjectByName('Spine2'),spineRest=spine?.quaternion.clone();
        const faceMeshes:Three.Mesh[]=[]; model.traverse(node=>{const mesh=node as Three.Mesh;if(mesh.morphTargetDictionary&&mesh.morphTargetInfluences)faceMeshes.push(mesh);});
        element.dataset.morphTargets=String(faceMeshes.reduce((total,mesh)=>total+Object.keys(mesh.morphTargetDictionary!).length,0));
        element.dataset.rigged=String(!!head);
        element.dataset.animationClips = String(gltf.animations.length);
        let frames = 0;
        const draw = (now: number) => {
          frame = 0;
          if (disposed || !visible || document.hidden || !renderer || !model || renderer.getContext().isContextLost()) { last = 0; return; }
          const moving = !activity.current.paused && !activity.current.reduced;
          const clock=speechRef.current?.current;
          const speaking=!!(clock?.audio && !clock.audio.paused && !clock.audio.ended && activity.current.state === 'streaming');
          const animate=moving||speaking;
          if (animate && last && now - last < 1000 / 30) { frame = requestAnimationFrame(draw); return; }
          const delta = last ? Math.min((now - last) / 1000, .08) : 1 / 30;
          last = animate ? now : 0;
          if (moving) {
            elapsed += delta;
            x += (targetX - x) * (1 - Math.exp(-delta * 7)); y += (targetY - y) * (1 - Math.exp(-delta * 7));
            mixer.update(delta * (variant === 'core' ? .18 : .7));
          }
          // Architecture stays anchored. A small camera offset reveals real room depth.
          if (variant === 'core') { model.rotation.y = x * .13; model.rotation.x = y * .06; }
          else { camera.position.x = moving ? x * .035 : 0; camera.position.y = 1.48 + (moving ? y * .015 : 0); camera.lookAt(0, 1.27, 0); }
          if(head && headRest){
            head.quaternion.copy(headRest);
            if(moving){head.rotateY(Math.sin(elapsed*.45)*.018);head.rotateX(Math.sin(elapsed*.33)*.012);}
          }
          if(spine&&spineRest){spine.quaternion.copy(spineRest);if(moving)spine.rotateX(Math.sin(elapsed*.8)*.003);}
          const viseme=speaking&&clock ? visemeAt(clock.cues,clock.audio!.currentTime) : 'viseme_sil';
          const blink=moving ? Math.max(0,1-Math.abs((elapsed%4.7)-4.5)/.09) : 0;
          let mouthWeight=0;
          for(const mesh of faceMeshes){
            for(const [name,index] of Object.entries(mesh.morphTargetDictionary!)){
              let target=0;
              if(name.startsWith('viseme_')) target=name===viseme ? 1 : 0;
              else if(name==='eyeBlinkLeft'||name==='eyeBlinkRight') target=blink;
              else if(name==='mouthSmileLeft'||name==='mouthSmileRight') target=activity.current.state==='idle'?.12:.035;
              else if(name==='browInnerUp') target=activity.current.state==='listening'?.09:.025;
              const weights=mesh.morphTargetInfluences!;
              if(name.startsWith('viseme_')&&!speaking) weights[index]=0;
              else weights[index]+=(target-weights[index])*(1-Math.exp(-delta*22));
              if(name.startsWith('viseme_')&&name!=='viseme_sil')mouthWeight=Math.max(mouthWeight,weights[index]);
            }
          }
          element.dataset.viseme=viseme;
          element.dataset.mouthWeight=mouthWeight.toFixed(3);
          element.dataset.audioTime=clock?.audio?.currentTime.toFixed(3)??'0';
          element.dataset.blink=Math.max(0,...faceMeshes.map(mesh=>mesh.morphTargetInfluences![mesh.morphTargetDictionary!.eyeBlinkLeft]??0)).toFixed(3);
          if (variant === 'core' && (moving || activity.current.reduced)) {
            // A restrained dolly settles into the product, then slowly drifts.
            // Time advances only while visible and motion is permitted.
            const entrance = moving ? Math.exp(-elapsed * 1.6) : 0;
            camera.position.set(
              moving ? Math.sin(elapsed * .12) * .1 + x * .12 : 0,
              .15 + (moving ? Math.sin(elapsed * .1) * .05 + y * .06 : 0),
              5.8 + entrance * .55,
            );
            camera.lookAt(0, 0, 0);
          }
          renderer.render(scene, camera);
          element.dataset.frames = String(++frames);
          element.dataset.animationTime = mixer.time.toFixed(3);
          element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(4)).join(',');
          element.dataset.rotation = `${model.rotation.x.toFixed(4)},${model.rotation.y.toFixed(4)}`;
          element.dataset.triangles = String(renderer.info.render.triangles);
          if (frames === 1) setStatus('ready');
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
  }, [asset, variant, revision]);

  return <div ref={host} className={`blender-asset ${variant === 'core' ? 'c-sculpture' : 'blender-studio'}`} role="img" aria-label={variant === 'core' ? 'Faceted AI intelligence core with illuminated metallic orbits' : 'Digital human interviewer in a softly lit studio'} data-asset={asset} data-scene-state={status} data-state={state} data-motion={paused || reduced ? 'still' : 'active'}>
    {status !== 'ready' && <svg className="blender-static" viewBox="0 0 400 400" aria-hidden="true"><ellipse cx="200" cy="200" rx="145" ry="105" transform="rotate(-25 200 200)" fill="none" stroke="#6c5636" strokeWidth="3" /><path d="m200 100 88 100-88 100-88-100Z" fill="#031211" stroke="#00aebb" strokeWidth="2" /><path d="m200 100 25 100-25 100m-88-100h176" fill="none" stroke="#b99d73" strokeWidth="1" /></svg>}
  </div>;
}
