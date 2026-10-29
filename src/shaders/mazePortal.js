import * as THREE from 'three';

export const mazePortalVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The maze's way in from the Lobby, behind one of its bedroom doors
// (rooms/lobbyMazeDoor.js). Sealed, it's dark velvet with a faint shimmer;
// uOpen (0..1) grows an iris from the core (uCore metres up) that shows a
// three-armed spiral turning in polar coordinates, spinning faster while it
// opens so it reads as the doorway twisting open. uPulse flares the core
// when something is swallowed. The outline is cut in metres (uSize,
// uSpring: straight sides up to the springline, an elliptical top above
// it; a springline at the full height is a plain rectangle) so the same
// shape holds whatever the plane's size.
export const mazePortalFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec2 uSize;
  uniform float uSpring;
  uniform float uCore;
  uniform vec3 uSeal;
  uniform vec3 uDeep;
  uniform vec3 uMagenta;
  uniform vec3 uViolet;
  uniform vec3 uGold;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
    // A straight-sided opening up to the springline, an elliptical top above it.
    vec2 top = vec2(p.x / (uSize.x * 0.5), (p.y - uSpring) / max(uSize.y - uSpring, 0.001));
    float outline = p.y < uSpring ? abs(top.x) : length(top);
    float aa = fwidth(outline);
    float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, outline);
    if (inside < 0.01) discard;

    vec2 d = p - vec2(0.0, uCore);
    float r = length(d);
    float a = atan(d.y, d.x);
    float spin = uTime * (1.2 + (1.0 - uOpen) * 4.0);
    float arms = 0.5 + 0.5 * sin(3.0 * a - 7.0 * sqrt(r) + spin);
    float fine = 0.5 + 0.5 * sin(9.0 * a - 16.0 * sqrt(r) + spin * 1.7);
    vec3 vortex = mix(uDeep, uMagenta, arms * smoothstep(0.1, 1.6, r));
    vortex = mix(vortex, uViolet, fine * 0.35 * smoothstep(0.4, 2.5, r));
    vortex += uGold * pow(arms, 10.0) * 0.55 * smoothstep(0.3, 1.2, r);
    // A dark throat with a pale point at the far end of the tunnel.
    vortex *= 0.25 + 0.75 * smoothstep(0.05, 0.9, r);
    vortex += uViolet * (1.0 - smoothstep(0.0, 0.18, r)) * 0.8;
    vortex += mix(uViolet, vec3(1.0), 0.5) * uPulse * (1.0 - smoothstep(0.0, 2.2, r));

    float shimmer = 0.85 + 0.15 * sin(p.y * 7.0 + sin(p.x * 3.0 + uTime * 0.6) * 1.5);
    vec3 sealed = uSeal * shimmer;

    float iris = uOpen * 5.0;
    float irisAa = max(fwidth(r), 0.01);
    float open = 1.0 - smoothstep(iris - 0.06 - irisAa, iris, r);
    float rim = (1.0 - smoothstep(0.0, 0.22, abs(r - iris))) * step(0.001, uOpen);
    vec3 color = mix(sealed, vortex, open) + uGold * rim * 0.9;
    gl_FragColor = vec4(color, inside);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * @param {{ width: number, height: number, spring?: number, core?: number }} size the
 *   opening, in metres: a rectangle unless `spring` is set lower, with the
 *   vortex's core `core` up from the bottom
 */
export function createMazePortalMaterial({ width, height, spring = height, core = height * 0.45 }) {
  return new THREE.ShaderMaterial({
    name: 'MazePortalGLSL',
    uniforms: {
      uTime: { value: 0 }, uOpen: { value: 0 }, uPulse: { value: 0 },
      uSize: { value: new THREE.Vector2(width, height) }, uSpring: { value: spring }, uCore: { value: core },
      uSeal: { value: new THREE.Color(0x231634) }, uDeep: { value: new THREE.Color(0x0d0820) },
      uMagenta: { value: new THREE.Color(0xb13d83) }, uViolet: { value: new THREE.Color(0x7a5ce0) },
      uGold: { value: new THREE.Color(0xdaa94b) },
    },
    vertexShader: mazePortalVertexShader, fragmentShader: mazePortalFragmentShader,
    transparent: true,
  });
}
