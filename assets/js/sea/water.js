// The sea: one big plane with a shader that reads the baked sea floor (a height texture) for its colours. Turquoise
// over white sand, softly into teal and the deep blue-green; moving wave trains and chop, light patterns on the
// floor, sun glitter, foam on the beaches, surf on the reef edges, whitecaps; radial mist toward the edges.
// Colours and wave settings are "take 5", which Josh approved on Nov 7.

export function createWater(THREE, { heights, res, size, sun, horizon, sky, fog, low = false }) {
  // the sea floor as a half-float texture (filterable everywhere WebGL2 runs)
  const half = new Uint16Array(heights.length);
  for (let i = 0; i < heights.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  const htex = new THREE.DataTexture(half, res, res, THREE.RedFormat, THREE.HalfFloatType);
  htex.unpackAlignment = 1;   // rows of 513 half floats are not 4-byte multiples
  htex.minFilter = htex.magFilter = THREE.LinearFilter;
  htex.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    fog: false,
    defines: { OCT: low ? 3 : 4 },
    uniforms: {
      uTime: { value: 0 }, uH: { value: htex }, uSize: { value: size }, uRes: { value: res },
      uSun: { value: sun }, uHor: { value: horizon }, uSky: { value: sky }, uFog: { value: new THREE.Vector2(fog[0], fog[1]) },
    },
    vertexShader: WATER_VS, fragmentShader: WATER_FS,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2), material);
  mesh.name = 'water';
  return { mesh, setTime: (t) => { material.uniforms.uTime.value = t; } };
}

const WATER_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = `
uniform float uTime; uniform sampler2D uH; uniform float uSize; uniform float uRes; uniform vec3 uSun; uniform vec3 uHor; uniform vec3 uSky; uniform vec2 uFog;
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<OCT;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
float caustic(vec2 p, float t){ vec2 q = p; float c = 0.;
  for (int i=0;i<3;i++){ vec2 w = q + vec2(sin(q.y*1.3+t*0.9+float(i)*1.7), cos(q.x*1.2-t*0.8+float(i)*2.3))*0.55; float d = abs(sin(w.x)*cos(w.y)); c += pow(1.0-d, 6.0); q = q*1.6 + vec2(3.1,1.7); }
  return c/3.0; }
// grid point i sits at x = (i/(res-1) - 0.5)*size; sample at that texel's centre
float seabed(vec2 xz){ vec2 g = xz/uSize + 0.5; if (g.x<0.||g.x>1.||g.y<0.||g.y>1.) return -9.0; return texture2D(uH, (g*(uRes-1.0) + 0.5)/uRes).r; }
// a sea surface: four wave trains plus chop; returns height, writes the slope
float waves(vec2 p, float t, out vec2 grad){
  float hgt = 0.; grad = vec2(0.);
  vec2 D[4]; D[0]=normalize(vec2(1.0,0.35)); D[1]=normalize(vec2(0.6,1.0)); D[2]=normalize(vec2(-0.4,1.0)); D[3]=normalize(vec2(1.0,-0.7));
  float L[4]; L[0]=19.0; L[1]=11.0; L[2]=7.0; L[3]=4.3;
  float A[4]; A[0]=0.12; A[1]=0.14; A[2]=0.11; A[3]=0.07;
  for (int i=0;i<4;i++){
    float k = 6.2831/L[i], ph = dot(D[i], p)*k - t*sqrt(9.8*k)*0.55 + float(i)*1.3 + fbm(p*0.035 + float(i)*3.1)*6.0;
    float s = sin(ph), c = cos(ph);
    float sharp = 0.5 + 0.5*s; sharp = sharp*sharp;            // peaky crests, flat troughs
    hgt += A[i]*sharp;
    grad += D[i]*k*A[i]*(1.0 + s)*c;
  }
  vec2 q = p*0.55 + vec2(t*0.25, t*0.15);
  float n0 = fbm(q), nx = fbm(q+vec2(0.08,0.)), nz = fbm(q+vec2(0.,0.08));
  grad += vec2(nx-n0, nz-n0)/0.08*0.6;
  hgt += n0*0.2;
  return hgt;
}
void main(){
  float t = uTime;
  vec2 xz = vW.xz;
  float hb = seabed(xz);
  float depth = -hb;
  if (depth < -0.1) discard;
  float mist = smoothstep(uFog.x, uFog.y, length(xz));
  vec3 col = uHor;
  if (mist < 1.0) {                                                 // (beyond the mist there is only mist)
    float dist = length(cameraPosition - vW);
    float calm = smoothstep(0.0, 3.5, depth);                       // smaller waves in the shallows
    vec2 grad; float wh = waves(xz, t, grad);
    float fade = 1.0/(1.0 + dist*0.0035);
    vec3 N = normalize(vec3(-grad.x*0.26*mix(0.35, 1.0, calm)*fade, 1.0, -grad.y*0.26*mix(0.35, 1.0, calm)*fade));
    vec3 V = normalize(cameraPosition - vW);
    // colour by depth, matched to the reference pictures (long, soft ramps)
    col = vec3(0.62,0.90,0.83);                                     // water over white sand
    col = mix(col, vec3(0.22,0.80,0.77), smoothstep(-0.1, 1.2, depth));
    col = mix(col, vec3(0.06,0.66,0.71), smoothstep(0.6, 3.2, depth));
    col = mix(col, vec3(0.03,0.48,0.60), smoothstep(2.2, 6.0, depth));
    col = mix(col, vec3(0.02,0.27,0.42), smoothstep(4.5, 9.0, depth));
    col = mix(col, vec3(0.012,0.19,0.32), smoothstep(60.0, 240.0, length(xz)) * smoothstep(5.0, 9.0, depth));
    // the sea floor in the shallows: sand ripples and dark reef rock
    float bed = fbm(xz*0.16);
    float reefRock = smoothstep(0.56, 0.68, fbm(xz*0.07 + 4.0)) * smoothstep(0.2, 1.2, depth);
    col *= mix(1.0, (0.92 + 0.18*bed) * (1.0 - 0.5*reefRock), exp(-depth*0.25));
    vec2 refr = grad*0.15 + vec2(fbm(xz*0.25 + t*0.2), fbm(xz*0.25 + 7.3 - t*0.2)) - 0.5;
    float ca = caustic(xz*0.45 + refr*1.4, t*1.1);
    col += ca * 0.3 * exp(-depth*0.32) * vec3(0.8,1.0,0.95) / (1.0 + dist*0.006);
    // light on the waves: the sunny faces brighten, the troughs deepen
    float sunLit = dot(N, uSun);
    col *= 0.86 + 0.32*sunLit;
    col += vec3(0.05,0.12,0.12) * smoothstep(0.25, 0.75, wh) * calm;    // light passing through the wave crests
    // sky reflection and sun glitter
    float fr = 0.02 + 0.98*pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 skyR = mix(uHor, uSky, clamp(reflect(-V, N).y*1.5, 0., 1.));
    col = mix(col, skyR, fr*0.75);
    vec3 R = reflect(-uSun, N);
    float sp = pow(max(dot(R, V), 0.0), 220.0);
    col += vec3(1.0,0.95,0.82) * sp * 3.0;
    col += vec3(1.0,0.95,0.85) * pow(max(dot(R, V), 0.0), 18.0) * 0.08;   // a soft sun sheen
    // foam: swash and breaking lines on the beach, whitecaps out in the deep, surf on the reef edge
    float lace = fbm(xz*1.1 + vec2(t*0.3, -t*0.25));
    float swash = smoothstep(0.35, 0.0, depth + 0.1*sin(t*1.2 + xz.x*0.25 + xz.y*0.2)) * smoothstep(0.28, 0.6, lace + 0.3);
    float rings = smoothstep(0.88, 1.0, sin(depth*5.5 - t*1.5 + lace*3.0)) * smoothstep(1.5, 0.25, depth) * smoothstep(0.42, 0.62, lace);
    vec2 g = vec2(seabed(xz+vec2(1.0,0.)) - seabed(xz-vec2(1.0,0.)), seabed(xz+vec2(0.,1.0)) - seabed(xz-vec2(0.,1.0)));
    float reef = smoothstep(0.9, 2.4, length(g)) * smoothstep(1.6, 3.2, depth) * smoothstep(9.0, 4.0, depth);
    float surf = reef * smoothstep(0.42, 0.62, fbm(xz*0.7 + vec2(t*0.5, 0.0)) + 0.18*sin(t*1.6 + xz.y*0.2));
    float caps = smoothstep(0.78, 0.95, wh) * smoothstep(0.55, 0.8, fbm(xz*0.35 + vec2(t*0.2, 0.))) * calm * 0.8;
    float foam = clamp(swash + rings*0.6 + surf*0.95 + caps, 0., 1.);
    col = mix(col, vec3(0.96,0.99,1.0), foam);
    col = mix(col, uHor, mist);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
