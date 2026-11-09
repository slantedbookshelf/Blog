const vertex = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
const fragment = `
precision highp float;
uniform sampler2D atlas;
uniform vec2 size;
uniform vec2 cell;
uniform float dpr;
uniform float count;
uniform float time;
uniform float rest;
uniform float haze;
uniform float hoverInk;
uniform float activity;
uniform vec2 drift;
uniform vec3 color;
uniform vec3 accent;
uniform vec4 waves[24];
uniform vec4 trail[12];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float clouds(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    v += a * smoothNoise(p);
    p = p * 2.02 + vec2(17.1, 9.4);
    a *= 0.5;
  }
  return v;
}

float outline(float kind, float angle, float phase) {
  if (kind < 0.5) return 1.0;
  if (kind < 1.5) {
    float s = sin(angle);
    float c = cos(angle);
    return (2.0 - 2.0 * s + s * sqrt(abs(c)) / (s + 1.4)) * 0.42;
  }
  return 1.0 + 0.14 * sin(3.0 * angle + phase) + 0.08 * sin(5.0 * angle - phase * 1.3);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec2 index = floor(pixel / cell);
  vec2 point = (index + 0.5) * cell / dpr;

  float ring = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 a = waves[i * 2];
    vec4 b = waves[i * 2 + 1];
    if (a.w <= 0.0) continue;
    vec2 v = point - a.xy;
    float angle = atan(-v.y, v.x);
    float shape = mix(1.0, outline(b.x, angle, b.z), b.y);
    shape *= 1.0 + 0.07 * sin(3.0 * angle + b.z + b.w) + 0.05 * sin(5.0 * angle - b.z * 1.7 - b.w * 1.3) + 0.03 * sin(9.0 * angle + b.w * 2.1);
    float d = length(v) - a.z * shape;
    float k = d > 0.0 ? d / 10.0 : d / 30.0;
    ring = max(ring, exp(-k * k) * a.w);
  }

  float hover = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 t = trail[i];
    if (t.w <= 0.0) continue;
    vec2 v = point - t.xy;
    hover += t.w * exp(-dot(v, v) / (2.0 * t.z * t.z));
  }
  hover = min(hover, 1.0);

  mat2 turn = mat2(0.82, 0.57, -0.57, 0.82);
  vec2 q = turn * (point - drift);
  float blob = smoothNoise(vec2(q.x / 140.0, q.y / 80.0) + vec2(time * 0.04, 0.0)) * 0.62
    + smoothNoise(vec2(q.x / 62.0, q.y / 36.0) + vec2(3.7, time * 0.06)) * 0.38;
  float grain = smoothNoise(vec2(q.x / 30.0, q.y / 14.0) + vec2(time * 0.2, 7.3));
  float cloud = blob * (0.82 + 0.24 * grain);
  float mask = pow(smoothstep(0.47 - 0.2 * activity, 0.84, cloud), 2.6);

  float seed = hash(index);
  float epoch = floor(time * 0.08 * (0.4 + seed) + seed * 97.0);
  float character = floor(hash(index + epoch * 0.137) * count);
  vec2 local = fract(pixel / cell);
  float ink = pow(texture2D(atlas, vec2((character + local.x) / count, local.y)).a, 1.7);

  float grey = ink * clamp(rest + haze * mask * (1.0 + 0.3 * activity) + hoverInk * hover * (0.6 + 0.4 * mask), 0.0, 1.0);
  float blue = ink * min(1.0, ring * 1.15);
  float alpha = grey + blue - grey * blue;
  vec3 tint = color * grey * (1.0 - blue) + accent * blue;
  gl_FragColor = vec4(tint, alpha);
}
`;

export function initGlyphBackground() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-kinetic-grid-canvas]')!;
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })!;
  if (!gl) return;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type); if (!s) return null;
    gl.shaderSource(s, source); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment), program = gl.createProgram();
  if (!vs || !fs || !program) return;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let dpr=1, cellWidth=7, cellHeight=13;
  const resize = () => {
    dpr=Math.min(window.devicePixelRatio || 1,2); canvas.width=Math.round(innerWidth*dpr); canvas.height=Math.round(innerHeight*dpr);
    const atlas=document.createElement('canvas'); const ctx=atlas.getContext('2d'); if(!ctx)return;
    ctx.font=`${10*dpr}px monospace`; cellWidth=Math.ceil(ctx.measureText('0').width); cellHeight=Math.ceil(12.5*dpr);
    atlas.width=cellWidth*chars.length; atlas.height=cellHeight; ctx.font=`${10*dpr}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff';
    [...chars].forEach((c,i)=>ctx.fillText(c,(i+.5)*cellWidth,cellHeight/2));
    gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
    draw(performance.now());
  };
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const trail: {x:number;y:number;t:number}[]=[];
  const waves: {x:number;y:number;t:number;kind:number;phase:number;strength:number}[]=[];
  let frame=0, last=0;
  function draw(now:number) {
    const dark=document.documentElement.dataset.theme==='dark';
    const color=dark?[.56,.84,.66]:[.06,.42,.26];
    const waveData=new Float32Array(96), trailData=new Float32Array(48);
    waves.forEach((w,i)=>{const age=(now-w.t)/1000;if(age<=0||age>=4)return; const fade=Math.min(1,age/.05)*Math.exp(-Math.max(0,age-.4)/1.3)*Math.min(1,(4-age)/.5); waveData.set([w.x,w.y,560*age/(1+.66*age),fade*w.strength,w.kind,.12+.5*Math.min(1,age/2.2),w.phase,age*3],i*8);});
    trail.forEach((p,i)=>{const age=(now-p.t)/700;if(age>=0&&age<1)trailData.set([p.x,p.y,40+25*age,.55*(1-age)**2],i*4);});
    gl.viewport(0,0,canvas.width,canvas.height); gl.uniform1i(u('atlas'),0); gl.uniform2f(u('size'),canvas.width,canvas.height); gl.uniform2f(u('cell'),cellWidth,cellHeight); gl.uniform1f(u('dpr'),dpr); gl.uniform1f(u('count'),chars.length); gl.uniform1f(u('time'),now/1000); gl.uniform1f(u('rest'),.025); gl.uniform1f(u('haze'),.18); gl.uniform1f(u('hoverInk'),.75); gl.uniform1f(u('activity'),Math.exp(-(now-last)/900)); gl.uniform2f(u('drift'),-30*now/1000,12*now/1000); gl.uniform3fv(u('color'),color); gl.uniform3fv(u('accent'),color); gl.uniform4fv(u('waves'),waveData); gl.uniform4fv(u('trail'),trailData); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES,0,3);
  }
  function tick(now:number) { frame=0; draw(now); if(!document.hidden && !reduce.matches) frame=requestAnimationFrame(tick); }
  function start() { if(!frame && !document.hidden && !reduce.matches) frame=requestAnimationFrame(tick); else draw(performance.now()); }
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',e=>{if(reduce.matches)return; const now=performance.now(); const prev=trail[trail.length-1]; if(prev&&Math.hypot(e.clientX-prev.x,e.clientY-prev.y)<18)return; trail.push({x:e.clientX,y:e.clientY,t:now}); if(trail.length>12)trail.shift();last=now;},{passive:true});
  window.addEventListener('pointerdown',e=>{if(reduce.matches)return; const t=performance.now(),kind=1+Math.floor(Math.random()*2),phase=Math.random()*Math.PI*2; waves.push({x:e.clientX,y:e.clientY,t,kind,phase,strength:1},{x:e.clientX,y:e.clientY,t:t+300,kind,phase,strength:.55}); while(waves.length>12)waves.shift();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
  reduce.addEventListener('change',()=>{if(reduce.matches){cancelAnimationFrame(frame);frame=0;draw(performance.now());}else start();});
  new MutationObserver(()=>draw(performance.now())).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  resize(); start();
}
