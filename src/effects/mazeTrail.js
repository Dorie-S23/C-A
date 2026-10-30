import * as THREE from 'three';

// A maze trail hint: a ribbon of light (a gold core in a soft glow) along the
// corridors from Pomni to Jax, off the floor. Its bright head races out to him,
// light keeps running along it after, and the whole thing fades out, all
// within TRAIL_SECONDS.

export const TRAIL_SECONDS = 3;
const DRAW_SECONDS = 1.7;  // the head reaching him
const FADE_FROM = 2.3;     // then it fades out by TRAIL_SECONDS
const HEIGHT = 0.18;       // metres off the floor
const RADIUS = 0.1;        // its solid core
const HALO_RADIUS = 0.3;   // and the soft glow round it (so it reads on the white tiles too)

const vertexShader = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uHead;    // 0 at her .. 1 at him: how far it's drawn
  uniform float uFade;
  uniform float uLength;  // metres, so the glow sizes don't stretch with the path
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uStrength; // the core 1, its halo fainter
  varying float vAlong;
  void main() {
    if (vAlong > uHead) discard;
    float behind = (uHead - vAlong) * uLength;          // metres behind the head
    float head = exp(-behind * behind / 1.4);
    float flow = 0.5 + 0.5 * sin(vAlong * uLength * 1.6 - uTime * 14.0); // light running on towards him
    float glow = 0.55 + 0.3 * flow + head;
    vec3 colour = mix(uColor, vec3(1.0), clamp(head * 0.8, 0.0, 1.0));
    gl_FragColor = vec4(colour * min(glow, 1.4), clamp(glow, 0.0, 1.0) * uFade * uStrength);
  }
`;

/**
 * Lays the trail along `points` (world positions, her to him) under `parent`.
 * @returns {{ update(deltaSeconds: number): boolean, dispose(): void }}
 *   update returns false once it's over (then dispose it)
 */
export function playMazeTrail(parent, points, { color = 0xffb320 } = {}) {
  const path = points.map(point => new THREE.Vector3(point.x, HEIGHT, point.z))
    .filter((point, i, all) => i === 0 || point.distanceTo(all[i - 1]) > 0.05);
  if (path.length < 2) return { update: () => false, dispose() {} };
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal', 0.2);
  const length = curve.getLength();
  const segments = Math.max(24, Math.ceil(length * 6));
  // Shared by core and halo, so both run and fade together.
  const uniforms = {
    uHead: { value: 0 }, uFade: { value: 1 }, uLength: { value: length }, uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
  };
  const layer = (radius, strength, name) => {
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
      uniforms: { ...uniforms, uStrength: { value: strength } },
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), material);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return mesh;
  };
  const mesh = layer(RADIUS, 1, 'MazeTrailHint');
  mesh.add(layer(HALO_RADIUS, 0.28, 'MazeTrailHalo'));
  const material = mesh.material;
  parent.add(mesh);
  let time = 0, disposed = false;
  return {
    update(deltaSeconds) {
      if (disposed) return false;
      time += deltaSeconds;
      const drawn = Math.min(1, time / DRAW_SECONDS);
      material.uniforms.uHead.value = 1 - (1 - drawn) ** 3; // quick out of her hands, easing in to him
      material.uniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(time, FADE_FROM, TRAIL_SECONDS);
      material.uniforms.uTime.value = time;
      return time < TRAIL_SECONDS;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.traverse(part => { part.geometry.dispose(); part.material.dispose(); });
    },
  };
}
