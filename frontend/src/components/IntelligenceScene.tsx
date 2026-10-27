import { useEffect, useId, useRef, useState } from 'react';
import { landingMotion, useLandingReducedMotion } from './landing-motion';

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

// Signed-distance geometry, studio reflections and physically positioned lights.
// This is a rendered 3D scene, with no image/video assets or scene dependencies.
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
mat2 turn(float a) { float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
vec2 nearest(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
float ring(vec3 p, float radius, float thickness) { return length(vec2(length(p.xy)-radius,p.z))-thickness; }
// A cut sapphire suspended inside a precision-machined orbital instrument.
// All surfaces are ray-marched geometry; no stock images or prerecorded motion.
vec2 scene(vec3 p) {
  p.xz=turn(.25+time*.035+pointer.x*.14)*p.xz;
  p.yz=turn(-.12+pointer.y*.10)*p.yz;
  vec3 a=p; a.yz=turn(.58)*a.yz;
  vec2 d=vec2(ring(a,1.40,.043),1.);
  vec3 b=p; b.xy=turn(-.48)*b.xy; b.yz=turn(1.18+sin(time*.10)*.035)*b.yz;
  d=nearest(d,vec2(ring(b,1.13,.026),1.));
  vec3 c=p; c.xy=turn(.65)*c.xy; c.xz=turn(1.15)*c.xz;
  d=nearest(d,vec2(ring(c,.87,.018),1.));
  vec3 crystal=p; crystal.xy=turn(.17)*crystal.xy; crystal.xz=turn(.42)*crystal.xz;
  float facets=(abs(crystal.x)+abs(crystal.y)+abs(crystal.z)-.98)*.57735;
  d=nearest(d,vec2(facets-.035,2.));
  vec3 e=p; e.yz=turn(.58)*e.yz;
  d=nearest(d,vec2(ring(e,1.47,.006),3.));
  vec3 guide=p; guide.xy=turn(.3)*guide.xy; guide.yz=turn(.85)*guide.yz;
  d=nearest(d,vec2(ring(guide,1.63,.0035),4.));
  return d;
}
vec3 normalAt(vec3 p) {
  vec2 e=vec2(.0015,0.);
  return normalize(vec3(scene(p+e.xyy).x-scene(p-e.xyy).x,scene(p+e.yxy).x-scene(p-e.yxy).x,scene(p+e.yyx).x-scene(p-e.yyx).x));
}
vec3 studio(vec3 r) {
  vec3 color=vec3(.035,.035,.035);
  color+=vec3(.93,.93,.93)*pow(max(dot(r,normalize(vec3(-.8,1.3,1.))),0.),8.);
  color+=vec3(.0,.44,.6)*pow(max(dot(r,normalize(vec3(1.,.1,.5))),0.),12.);
  color+=vec3(.25,.04,.14)*pow(max(dot(r,normalize(vec3(-1.,-.3,.2))),0.),8.);
  color+=vec3(1.,.18,.58)*pow(max(dot(r,normalize(vec3(.2,-.8,1.))),0.),18.)*.32;
  float strip=smoothstep(.965,.995,dot(r,normalize(vec3(-.35,.65,1.))));
  color+=vec3(.93,.93,.93)*strip*1.8;
  float softbox=pow(max(dot(r,normalize(vec3(.8,.9,-.3))),0.),22.);
  color+=vec3(.0,.39,.53)*softbox;
  return color;
}
// Sparse analytic orbital particles cost a fixed six ray tests, not extra march steps.
vec4 particles(vec3 ro, vec3 rd, float surfaceDepth) {
  float alpha=0.;
  for(int i=0;i<6;i++) {
    float a=float(i)*1.0472+time*.035;
    vec3 particle=vec3(cos(a)*1.66,sin(a)*1.25,sin(a*2.+.7)*.65);
    particle.xz=turn(-.28-time*.075-pointer.x*.18)*particle.xz;
    float along=dot(particle-ro,rd);
    float distanceToRay=length(ro+rd*along-particle);
    if(along>0. && along<surfaceDepth) alpha=max(alpha,1.-smoothstep(.004,.019,distanceToRay));
  }
  return vec4(vec3(.0,.56,.66),alpha*.8);
}
void main() {
  vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
  vec3 ro=vec3(0.,.1,5.35), rd=normalize(vec3(uv,-3.25));
  float b=dot(ro,rd), h=b*b-dot(ro,ro)+3.0;
  if(h<0.) { gl_FragColor=particles(ro,rd,100.); return; }
  float depth=max(0.,-b-sqrt(h)), end=-b+sqrt(h);
  vec2 hit=vec2(1.); bool found=false;
  for(int i=0;i<72;i++) {
    hit=scene(ro+rd*depth);
    if(hit.x<.0012) { found=true; break; }
    depth+=hit.x*.9;
    if(depth>end) break;
  }
  if(!found) { gl_FragColor=particles(ro,rd,100.); return; }
  vec3 p=ro+rd*depth, n=normalAt(p), v=-rd;
  float facing=max(dot(n,v),0.), fresnel=pow(1.-facing,3.);
  vec3 l=normalize(vec3(-.6,1.,1.5));
  float diffuse=max(dot(n,l),0.);
  float spec=pow(max(dot(reflect(-l,n),v),0.),95.);
  vec3 color=studio(reflect(rd,n))*.94+vec3(.035,.035,.035)*diffuse;
  color+=vec3(.93,.93,.93)*spec*.7;
  color+=vec3(.0,.37,.55)*fresnel*.45;
  if(hit.y>1.5 && hit.y<2.5) {
    vec3 base=mix(vec3(.008,.008,.008),vec3(.0,.18,.27),smoothstep(-.7,.8,n.x+n.y*.5));
    color=base*(.45+diffuse*.65)+studio(reflect(rd,n))*.8;
    color+=vec3(.0,.48,.65)*fresnel*.75+spec*.85;

  }
  if(hit.y>2.5 && hit.y<3.5) color=vec3(.0,.48,.65)*(.8+.04*sin(time*.6));
  if(hit.y>3.5) color=vec3(.25,.04,.14)*(.7+.3*facing);
  float ao=clamp(scene(p+n*.14).x/.14,.35,1.);
  color*=.65+.35*ao;
  color=vec3(1.)-exp(-color*1.65);
  color=pow(color,vec3(.94));
  vec4 particle=particles(ro,rd,depth);
  gl_FragColor=vec4(mix(color,particle.rgb,particle.a),1.);
}
`;

export function IntelligenceScene({ paused, onStatusChange }: { paused: boolean; onStatusChange?: (status: 'loading' | 'ready' | 'fallback') => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const schedule = useRef<() => void>(() => {});
  const pausedRef = useRef(paused);
  const reduceMotion = useLandingReducedMotion();
  const reducedRef = useRef(!!reduceMotion);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [revision, setRevision] = useState(0);
  const gradientId = useId().replaceAll(':', '');

  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);
  useEffect(() => { pausedRef.current = paused; reducedRef.current = !!reduceMotion; schedule.current(); }, [paused, reduceMotion]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let gl: WebGLRenderingContext | null = null;
    try { gl = surface.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power', premultipliedAlpha: false }); } catch { /* Static art is the supported fallback. */ }
    if (!gl) { setStatus('fallback'); return; }
    const context = gl;
    const shaders: WebGLShader[] = [];
    const program = context.createProgram();
    const buffer = context.createBuffer();
    let frame = 0, visible = true, disposed = false, last = 0, elapsed = 0;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    const release = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (buffer) context.deleteBuffer(buffer);
      if (program) context.deleteProgram(program);
      shaders.forEach((shader) => context.deleteShader(shader));
    };
    try {
      if (!program || !buffer) throw new Error('WebGL allocation unavailable');
      for (const [type, source] of [[context.VERTEX_SHADER, vertexSource], [context.FRAGMENT_SHADER, fragmentSource]] as const) {
        const shader = context.createShader(type);
        if (!shader) throw new Error('Shader unavailable');
        shaders.push(shader); context.shaderSource(shader, source); context.compileShader(shader);
        if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error('Shader compilation unavailable');
        context.attachShader(program, shader);
      }
      context.linkProgram(program);
      if (!context.getProgramParameter(program, context.LINK_STATUS)) throw new Error('Scene linking unavailable');
      context.useProgram(program);
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), context.STATIC_DRAW);
      const attribute = context.getAttribLocation(program, 'position');
      context.enableVertexAttribArray(attribute); context.vertexAttribPointer(attribute, 2, context.FLOAT, false, 0, 0);
      const resolution = context.getUniformLocation(program, 'resolution');
      const clock = context.getUniformLocation(program, 'time');
      const pointer = context.getUniformLocation(program, 'pointer');
      const draw = (now: number) => {
        frame = 0;
        if (disposed || context.isContextLost() || !visible || document.hidden) { last = 0; return; }
        const moving = !pausedRef.current && !reducedRef.current;
        if (moving && last && now-last < landingMotion.frameInterval) { frame = requestAnimationFrame(draw); return; }
        const delta = last ? Math.min((now-last)/1000, landingMotion.maxFrameDelta) : landingMotion.frameInterval/1000;
        if (moving && last) elapsed += delta;
        last = moving ? now : 0;
        const response = 1-Math.exp(-delta*landingMotion.pointerResponse);
        if (moving) { x += (targetX-x)*response; y += (targetY-y)*response; }
        context.uniform2f(resolution, surface.width, surface.height);
        context.uniform1f(clock, elapsed); context.uniform2f(pointer, x, y);
        context.drawArrays(context.TRIANGLES, 0, 6);
        if (moving) frame = requestAnimationFrame(draw);
      };
      const start = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
      schedule.current = start;
      const resize = () => {
        const bounds = surface.getBoundingClientRect();
        const density = Math.min(window.devicePixelRatio || 1, 1.25, 900/Math.max(bounds.width, bounds.height, 1));
        surface.width = Math.max(1, Math.round(bounds.width*density)); surface.height = Math.max(1, Math.round(bounds.height*density));
        context.viewport(0, 0, surface.width, surface.height); start();
      };
      const move = (event: PointerEvent) => {
        if (reducedRef.current || pausedRef.current || event.pointerType !== 'mouse') return;
        const bounds = surface.getBoundingClientRect();
        targetX = ((event.clientX-bounds.left)/bounds.width-.5)*2;
        targetY = ((event.clientY-bounds.top)/bounds.height-.5)*2;
      };
      const leave = () => { targetX = 0; targetY = 0; };
      const visibility = () => { last = 0; start(); };
      const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; setStatus('fallback'); };
      const restored = () => setRevision((n) => n+1);
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0; if (visible) start(); }, { rootMargin: '60px' });
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(surface); observer.observe(surface);
      surface.addEventListener('pointermove', move); surface.addEventListener('pointerleave', leave);
      surface.addEventListener('webglcontextlost', lost); surface.addEventListener('webglcontextrestored', restored);
      document.addEventListener('visibilitychange', visibility);
      resize(); setStatus('ready');
      return () => {
        disposed = true; schedule.current = () => {}; release(); observer.disconnect(); resizeObserver.disconnect();
        surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', leave);
        surface.removeEventListener('webglcontextlost', lost); surface.removeEventListener('webglcontextrestored', restored);
        document.removeEventListener('visibilitychange', visibility);
      };
    } catch { release(); setStatus('fallback'); }
  }, [revision]);

  return <div className="c-sculpture" role="img" aria-label="Faceted teal-lit AI core suspended within precision metallic orbits and six light particles" data-scene-state={status} data-motion={paused || reduceMotion ? 'still' : 'active'}>
    <div className="c-sculpture-aura" />
    <svg className={`c-sculpture-fallback ${status === 'ready' ? 'is-hidden' : ''}`} viewBox="0 0 600 600" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1"><stop style={{ stopColor: 'var(--paint-snow)' }} /><stop offset=".34" style={{ stopColor: 'var(--paint-cerulean)' }} /><stop offset=".65" style={{ stopColor: 'var(--paint-abyss)' }} /><stop offset="1" style={{ stopColor: 'var(--paint-cerulean)' }} /></linearGradient>
        <linearGradient id={`${gradientId}Core`} x1="0" x2="1" y1="0" y2="1"><stop style={{ stopColor: 'var(--paint-cerulean)' }} /><stop offset=".42" style={{ stopColor: 'var(--paint-jet)' }} /><stop offset="1" style={{ stopColor: 'var(--paint-abyss)' }} /></linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gradientId})`}><ellipse cx="300" cy="300" rx="206" ry="190" transform="rotate(-22 300 300)" strokeWidth="5" /><ellipse cx="300" cy="300" rx="164" ry="78" transform="rotate(-42 300 300)" strokeWidth="3" /><ellipse cx="300" cy="300" rx="74" ry="148" transform="rotate(-25 300 300)" strokeWidth="2" /></g>
      <path d="m300 176 94 110-28 85-66 53-97-120 24-71Z" fill={`url(#${gradientId}Core)`} style={{ stroke: 'color-mix(in srgb, var(--paint-cerulean-text) 50%, transparent)' }} strokeWidth="1" />
      <path d="m300 176 12 128 82-18m-82 18-12 120m12-120-109 0m109 0 54 67" fill="none" style={{ stroke: 'color-mix(in srgb, var(--paint-cerulean-text) 27%, transparent)' }} />
    </svg>
    <canvas ref={canvas} className={status === 'ready' ? '' : 'is-hidden'} aria-hidden="true" />
    <div className="c-sculpture-shadow" />
  </div>;
}
