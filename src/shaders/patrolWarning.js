import * as THREE from 'three';

export const patrolWarningVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A UV-space marquee: narrow V-shaped bands travel along the strip while a
// soft violet undertone ties the amber warning into the circus palette.
export const patrolWarningFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform vec3 uAmber;
  uniform vec3 uViolet;
  uniform vec3 uTrack;
  varying vec2 vUv;
  void main() {
    float crossStrip = abs(vUv.x * 2.0 - 1.0);
    // Differentiate the unwrapped phase so anti-aliasing stays crisp at wraps.
    float cycle = vUv.y * uLength * 1.10 - uTime * 0.64 - crossStrip * 0.36;
    float phase = fract(cycle);
    float aa = clamp(fwidth(cycle), 0.008, 0.06);
    float chevron = smoothstep(0.08-aa, 0.08+aa, phase)
                  * (1.0-smoothstep(0.41-aa, 0.41+aa, phase));
    float border = smoothstep(0.80, 0.90, crossStrip)
                 * (1.0-smoothstep(0.97, 1.0, crossStrip));
    float endFade = smoothstep(0.0, 0.055, vUv.y)
                  * (1.0-smoothstep(0.945, 1.0, vUv.y));
    float violetMix = 0.12 + 0.08 * sin(vUv.y * 5.0 - uTime * 0.45);
    vec3 glyph = mix(uAmber, uViolet, violetMix);
    // Restrained plum backing gives the gold definition on BOTH floor tiles.
    vec3 color = mix(uTrack, glyph, chevron);
    color = mix(color, uViolet, border * 0.65);
    float alpha = max(0.38, max(chevron * 0.96, border * 0.72)) * endFade;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createPatrolWarningMaterial(length) {
  return new THREE.ShaderMaterial({
    name: 'PatrolWarningGLSL',
    uniforms: {
      uTime: { value: 0 }, uLength: { value: length },
      uTrack: { value: new THREE.Color(0x30243e) },
      uAmber: { value: new THREE.Color(0xffcf79) }, uViolet: { value: new THREE.Color(0xb899e7) },
    },
    vertexShader: patrolWarningVertexShader, fragmentShader: patrolWarningFragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
