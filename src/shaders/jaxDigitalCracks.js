import * as THREE from 'three';

// Displace only the separate decorative overlay. Two slow waves create a
// breathing digital surface, bounded to 12 mm even at maximum proximity.
export const jaxDigitalCracksVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uNear;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float envelope = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    float ripple = sin(uv.y * 19.0 + uTime * 0.65) * 0.007;
    vec3 displaced = position + normal * ripple * envelope * (0.55 + 0.45 * uNear);
    displaced.y += sin(uv.x * 14.0 - uTime * 0.48) * 0.004 * envelope;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

// Original cellular fracture field. The gap between the two closest seeded
// sites traces angular cracks; staggered UV rows add small digital breaks.
// No noise textures, screen distortion, lighting changes or model mutation.
export const jaxDigitalCracksFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uNear;
  uniform vec3 uMagenta;
  uniform vec3 uViolet;
  varying vec2 vUv;
  vec2 site(vec2 p) {
    return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)))) * 43758.5453);
  }
  void main() {
    vec2 p = vUv * vec2(3.6, 6.0);
    vec2 tile = floor(p);
    vec2 local = fract(p);
    float nearest = 10.0;
    float second = 10.0;
    for (int y=-1; y<=1; y++) {
      for (int x=-1; x<=1; x++) {
        vec2 neighbor = vec2(float(x),float(y));
        vec2 delta = neighbor + 0.18 + site(tile+neighbor) * 0.64 - local;
        float d = dot(delta,delta);
        if (d < nearest) { second = nearest; nearest = d; }
        else if (d < second) { second = d; }
      }
    }
    float edge = second - nearest;
    float aa = max(fwidth(edge), 0.004);
    float fine = 1.0-smoothstep(0.008, 0.018+aa, edge);
    float halo = (1.0-smoothstep(0.025, 0.10, edge)) * 0.15;
    float row = floor(vUv.y * 29.0);
    float digitalGap = mix(0.7, 1.0, step(0.22, fract(row * 0.381966)));
    float scan = pow(0.5+0.5*sin(vUv.y * 12.0-uTime * 0.82), 6.0);
    float breathing = 0.86 + 0.14 * sin(uTime * 0.65 + vUv.x * 6.0);
    float fade = smoothstep(0.0,0.045,vUv.x) * (1.0-smoothstep(0.955,1.0,vUv.x))
               * smoothstep(0.0,0.04,vUv.y) * (1.0-smoothstep(0.96,1.0,vUv.y));
    float alpha = (fine * (0.22 + 0.12*uNear + 0.1*scan) + halo) * fade * breathing * digitalGap;
    vec3 color = mix(uViolet, uMagenta, 0.4 + 0.35*sin(vUv.y * 4.0 + uTime * 0.28));
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createJaxDigitalCracksMaterial() {
  return new THREE.ShaderMaterial({
    name: 'JaxDigitalCracksGLSL',
    uniforms: {
      uTime: { value: 0 }, uNear: { value: 0 },
      uMagenta: { value: new THREE.Color(0xf586df) }, uViolet: { value: new THREE.Color(0xb09aff) },
    },
    vertexShader: jaxDigitalCracksVertexShader, fragmentShader: jaxDigitalCracksFragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
